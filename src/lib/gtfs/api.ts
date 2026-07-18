import type { HttpOptions, HttpResponse } from '@capacitor/core';
import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { FileTransfer } from '@capacitor/file-transfer';
import { Directory, Encoding, Filesystem, type GetUriOptions } from '@capacitor/filesystem';
import { CapacitorZip } from '@capgo/capacitor-zip';
import { strFromU8, unzipSync } from 'fflate';
import GtfsRealtimeBindings from "gtfs-realtime-bindings";
import Papa from 'papaparse';

import { realtimeGtfsDataStore, staticGtfsDataStore } from '../../stores';
import type { Route, Stop, StopTimes, Trip, Vehicle } from './types';

import { saveDataInChunks } from '$lib/file-storage';
import { getStopTimesDataKeyFromTripId } from '$lib/utils';

const yieldToMain = () => new Promise<void>(resolve => setTimeout(resolve, 0));

const USER_AGENT = 'findmybus-app';

function base64ToUint8Array(base64: string): Uint8Array {
    const binaryString = window.atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
}

async function readCsvFile(filename: string, zipData?: Uint8Array): Promise<any[]> {
    if (zipData) {
        const unzipped = unzipSync(zipData, { filter: (f) => f.name == filename });
        if (!unzipped[filename]) throw new Error("Missing file: " + filename);
        const string = strFromU8(unzipped[filename]);
        const parsed = Papa.parse(string, { header: true, skipEmptyLines: true });
        return parsed.data as Array<Record<string, string>>;
    } else {
        const text = await Filesystem.readFile({
            directory: Directory.Cache,
            path: `gtfs_unzipped/${filename}`,
            encoding: Encoding.UTF8
        });
        return Papa.parse(text.data as string, { header: true, skipEmptyLines: true }).data;
    }
}

// The types here aren't perfect, as some of these fields are optional in the GTFS spec.
// However, these are the fields this app expects, and there should be better error-handling
// in the future.

type StopsFile = {
    stop_id: string;
    stop_name: string;
    stop_lat: string;
    stop_lon: string;
    location_type: string;
    parent_station: string;
}[];

type RoutesFile = {
    route_id: string;
    route_short_name: string | undefined;
    route_long_name: string | undefined;
    route_type: string;
    route_color: string | undefined;
    route_text_color: string | undefined;
}[];

type TripsFile = {
    trip_id: string;
    route_id: string;
    trip_headsign: string | undefined;
}[];

type StopTimesFile = {
    trip_id: string;
    arrival_time: string;
    departure_time: string | undefined;
    end_pickup_drop_off_window: string | undefined;
    stop_id: string;
    stop_sequence: string;
}[];

type StopTimeEntry = {
    trip_id: string;
    stop_id: string;
    departure_time?: string;
    end_pickup_drop_off_window?: string;
    stop_sequence: number;
};

async function parseStopTimes(
    zipData: Uint8Array | undefined,
    onStopTime: (stopTime: StopTimeEntry) => void
) {
    if (Capacitor.getPlatform() === 'web') {
        const file = await readCsvFile('stop_times.txt', zipData) as StopTimesFile;
        for (const row of file) {
            onStopTime({
                trip_id: row.trip_id,
                stop_id: row.stop_id,
                departure_time: row.departure_time,
                end_pickup_drop_off_window: row.end_pickup_drop_off_window,
                stop_sequence: Number(row.stop_sequence)
            });
        }
    } else {
        const fileUriInfo = await Filesystem.getUri({
            directory: Directory.Cache,
            path: 'gtfs_unzipped/stop_times.txt'
        });
        const fileUrl = Capacitor.convertFileSrc(fileUriInfo.uri);

        const response = await fetch(fileUrl);
        const reader = response.body?.getReader();
        if (!reader) throw new Error("Failed to read stop_times.txt from cache");

        const decoder = new TextDecoder("utf-8");
        let buffer = '';
        let isHeader = true;
        let tripIdIdx = -1, stopIdIdx = -1, depTimeIdx = -1, seqIdx = -1, endWindowIdx = -1;

        while (true) {
            const { done, value } = await reader.read();
            buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
            const lines = buffer.split(/\r?\n/);
            buffer = done ? '' : (lines.pop() || '');

            for (const line of lines) {
                if (!line.trim()) continue;
                if (isHeader) {
                    const headers = line.split(',').map(h => h.trim().replace(/^"|"$/g, ''));
                    tripIdIdx = headers.indexOf('trip_id');
                    stopIdIdx = headers.indexOf('stop_id');
                    depTimeIdx = headers.indexOf('departure_time');
                    endWindowIdx = headers.indexOf('end_pickup_drop_off_window');
                    seqIdx = headers.indexOf('stop_sequence');
                    isHeader = false;
                    continue;
                }

                const values = line.split(',');
                const tripId = values[tripIdIdx]?.trim().replace(/^"|"$/g, '');
                const stopId = values[stopIdIdx]?.trim().replace(/^"|"$/g, '');
                const departureTime = depTimeIdx !== -1 ? values[depTimeIdx]?.trim().replace(/^"|"$/g, '') : undefined;
                const endWindow = endWindowIdx !== -1 ? values[endWindowIdx]?.trim().replace(/^"|"$/g, '') : undefined;
                const stopSequence = Number(values[seqIdx]);

                if (tripId && stopId && (departureTime || endWindow)) {
                    onStopTime({
                        trip_id: tripId,
                        stop_id: stopId,
                        departure_time: departureTime,
                        end_pickup_drop_off_window: endWindow,
                        stop_sequence: stopSequence
                    });
                }
            }
            if (done) break;
        }
    }
}

export async function fetchStaticGtfs(url: string, onProgress: (progress: number, phase: string) => void) {
    const reportProgress = async (progress: number, phase: string) => {
        onProgress(progress, phase);
        await yieldToMain();
    };

    await reportProgress(0.1, 'download');
    let zipData: Uint8Array | undefined;
    const baseHttpOptions = {
        url: url,
        headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0',
            'User-Agent': USER_AGENT
        },
        connectTimeout: 4000,
        readTimeout: 4000
    };

    if (Capacitor.getPlatform() === 'web') {
        const response: HttpResponse = await CapacitorHttp.get({
            ...baseHttpOptions,
            responseType: 'blob'
        });
        const zipData = base64ToUint8Array(response.data);
        console.log(`GTFS static data loaded. Size: ${zipData.byteLength / (1024 * 1024)} MB`);
        return zipData;
    } else {
        const tmpFile: GetUriOptions = {
            directory: Directory.Cache,
            path: 'gtfs_temp.zip'
        };
        const fileUriInfo = await Filesystem.getUri(tmpFile);
        await FileTransfer.downloadFile({
            ...baseHttpOptions,
            path: fileUriInfo.uri
        });
        const destFolderUriInfo = await Filesystem.getUri({
            directory: Directory.Cache,
            path: 'gtfs_unzipped'
        });
        try {
            await Filesystem.rmdir({
                directory: Directory.Cache,
                path: 'gtfs_unzipped',
                recursive: true
            }).catch(() => {});

            await CapacitorZip.unzip({
                source: fileUriInfo.uri.replace(/^file:\/\//, ''),
                destination: destFolderUriInfo.uri.replace(/^file:\/\//, '')
            });
            console.log("Native unzip completed");
        } catch (unzipErr) {
            console.error("Native unzip failed:", unzipErr);
            throw unzipErr;
        } finally {
            await Filesystem.deleteFile(tmpFile).catch(() => {});
        }
    }

    // parse stops
    await reportProgress(0.3, 'stops');
    const stopsFile = await readCsvFile('stops.txt', zipData) as StopsFile;
    console.log(`Stops: ${stopsFile.length}`);

    const stops: Record<string, Stop> = {};
    const parentStopIds: string[] = [];

    for (const record of stopsFile) {
        const locationTypeMap = {
            '0': 'stop',
            '1': 'station',
            '2': 'door',
            '3': 'generic',
            '4': 'boardingArea',
        } as const;

        const parentStopId = record.parent_station || null;
        if (parentStopId) {
            parentStopIds.push(parentStopId);
        }

        stops[record.stop_id] = {
            id: record.stop_id,
            name: record.stop_name,
            location: {
                latitude: Number(record.stop_lat),
                longitude: Number(record.stop_lon)
            },
            type: locationTypeMap[record.location_type as keyof typeof locationTypeMap] || 'stop',
            parentStopId: parentStopId || null,
            hasChildren: false, // this is actually set in the next loop
        };
    }

    for (const stopId of parentStopIds) {
        stops[stopId].hasChildren = true;
    }

    // parse routes
    await reportProgress(0.4, 'routes');
    const routesFile = await readCsvFile('routes.txt', zipData) as RoutesFile;
    console.log(`Routes: ${routesFile.length}`);

    const routes: Record<string, Route> = {};

    for (const record of routesFile) {
        const routeTypeMap = {
            '0': 'tram',
            '1': 'subway',
            '2': 'train',
            '3': 'bus',
            '4': 'ferry',
            '5': 'cableTram',
            '6': 'cableCar',
            '7': 'funicular',
            '8': 'trolleybus',
            '9': 'monorail'
        } as const;

        routes[record.route_id] = {
            id: record.route_id,
            name: {
                short: record.route_short_name ? record.route_short_name.toString() : null,
                long: record.route_long_name ? record.route_long_name.toString() : null
            },
            type: routeTypeMap[record.route_type as keyof typeof routeTypeMap],
            color: {
                generic: record.route_color || null,
                text: record.route_text_color || null
            }
        };
    }

    // parse trips
    await reportProgress(0.5, 'trips');
    const tripsFile = await readCsvFile('trips.txt', zipData) as TripsFile;
    console.log(`Trips: ${tripsFile.length}`);

    const trips: Record<string, Trip> = {};

    for (const record of tripsFile) {
        trips[record.trip_id] = {
            id: record.trip_id,
            routeId: record.route_id,
            headsign: record.trip_headsign || null
        };
    }

    // parse stop times (and save them per trip id)
    await reportProgress(0.6, 'stopTimes');

    const stopTimesPerTrip: Record<string, StopTimes> = {};

    await parseStopTimes(zipData, (stopTime) => {
        const departureTime = (stopTime.departure_time || stopTime.end_pickup_drop_off_window) as string;

        if (!stopTimesPerTrip[stopTime.trip_id]) {
            stopTimesPerTrip[stopTime.trip_id] = [];
        }

        stopTimesPerTrip[stopTime.trip_id].push({
            stopId: stopTime.stop_id,
            departureTime: departureTime,
            sequence: stopTime.stop_sequence
        } as any);
    });

    await reportProgress(0.7, 'stopTimes');

    // Sort individual trip stop lists by sequence
    for (const tripId of Object.keys(stopTimesPerTrip)) {
        const stopsList = stopTimesPerTrip[tripId] as any[];
        stopsList.sort((a, b) => a.sequence - b.sequence);
        for (const item of stopsList) {
            delete item.sequence;
        }
    }

    await reportProgress(0.8, 'stopTimes');
    console.log(`Saved stop times for ${Object.keys(stopTimesPerTrip).length} trips.`);

    // as the stop time records are by far the largest in size, and also not needed until a specific vehicle is clicked on,
    // we save them in their own files, bunched together based on the first character of a hash of their ID,
    // so they're evenly distributed across the files, even if the actual ID numbers aren't
    const tripStopTimesPerKey: Record<string, Record<string, StopTimes>> = {};

    for (const [tripId, stopTimes] of Object.entries(stopTimesPerTrip)) {
        const key = await getStopTimesDataKeyFromTripId(tripId);

        if (!tripStopTimesPerKey[key]) {
            tripStopTimesPerKey[key] = {};
        }

        tripStopTimesPerKey[key][tripId] = stopTimes;
    }

    await reportProgress(0.9, 'save');
    console.log(`Split stop times under ${Object.keys(tripStopTimesPerKey).length} keys.`);

    // save the parsed info
    staticGtfsDataStore.set({
        dataTypeVersion: 0,
        timestamp: new Date().toString(),
        stops: stops,
        routes: routes,
        trips: trips
    });

    console.log("Saved to store.");

    // skip saving the stop times on web, due to localStorage size limits
    for (const [key, stopTimeRecords] of Object.entries(tripStopTimesPerKey)) {
        await saveDataInChunks(key, JSON.stringify(stopTimeRecords));
    }

    console.log("Saved stop times to data storage.");

    // Clean up the unzipped files from disk to reclaim storage space (mobile only)
    if (Capacitor.getPlatform() !== 'web') {
        await Filesystem.rmdir({
            directory: Directory.Cache,
            path: 'gtfs_unzipped',
            recursive: true
        }).catch(() => {});
    }

    console.log("Parsing and saving static GTFS done.");
    onProgress(1.0, 'stopTimes');
}

export async function fetchRealtimeGtfs(url: string) {
    // fetch the GTFS realtime file, which is a protobuf file
    const options: HttpOptions = {
        url: url,
        responseType: 'arraybuffer',
        headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0',
            'User-Agent': USER_AGENT
        },
        connectTimeout: 4000,
        readTimeout: 4000
    }

    const response: HttpResponse = await CapacitorHttp.get(options);
    console.log(`GTFS realtime data received. Size: ${response.data.length / (1024 * 1024)} MB`);

    const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(base64ToUint8Array(response.data));
    console.log(`GTFS realtime feed contains ${feed.entity.length} entities.`);

    // get the feed's timestamp
    const feedTimestamp = new Date(feed.header.timestamp as number * 1000).toString();

    // parse vehicles
    const vehicles: Vehicle[] = [];

    for (const entity of feed.entity) {
        if (entity.vehicle) {
            const vehicle = entity.vehicle;
            vehicles.push({
                id: entity.vehicle.vehicle && entity.vehicle.vehicle.id ? entity.vehicle.vehicle.id : Math.random().toString(),
                tripId: entity.vehicle.trip && entity.vehicle.trip.tripId ? entity.vehicle.trip.tripId : null,
                currentStopId: vehicle.stopId || null,
                position: vehicle.position?.latitude && vehicle.position?.longitude ? {
                    location: {
                        latitude: vehicle.position?.latitude,
                        longitude: vehicle.position?.longitude
                    },
                    bearing: vehicle.position?.bearing || null,
                    speed: vehicle.position?.speed || null // Speed in meters per second
                } : null
            });
        }
    }

    console.log(`Parsed ${vehicles.length} vehicles from GTFS realtime feed.`);

    // save the parsed info
    realtimeGtfsDataStore.set({
        localTimestamp: new Date().toString(),
        feedTimestamp: feedTimestamp,
        vehicles: vehicles
    });
}
