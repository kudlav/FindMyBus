import { Filesystem, Directory, Encoding } from "@capacitor/filesystem";

type ChunkDataMetadata = {
    dataTypeVersion: 0;
    chunkCount: number;
    chunkSize: number;
}

export async function saveData(key: string, data: string) {
    await Filesystem.writeFile({
        directory: Directory.Data,
        path: key,
        data: data,
        encoding: Encoding.UTF8,
        recursive: true
    });
}

export async function loadData(key: string): Promise<string> {
    const value = await Filesystem.readFile({
        directory: Directory.Data,
        path: key,
        encoding: Encoding.UTF8,
    });
    return value.data as string;
}

export async function saveDataInChunks(key: string, data: string) {
    // Split the data into chunks of 4194304 characters (approx. 4 MB)
    const chunkSize = 4194304;
    const chunks = [];
    for (let i = 0; i < data.length; i += chunkSize) {
        chunks.push(data.substring(i, i + chunkSize));
    }

    // Save each chunk
    for (let i = 0; i < chunks.length; i++) {
        const chunkKey = `${key}.${i}`;
        const chunkData = chunks[i];

        await saveData(chunkKey, chunkData);
    }

    // Save metadata
    const metadata: ChunkDataMetadata = {
        dataTypeVersion: 0,
        chunkCount: chunks.length,
        chunkSize: chunkSize
    };

    await saveData(`${key}.metadata`, JSON.stringify(metadata));
}

export async function loadDataInChunks(key: string): Promise<string> {
    // Get the metadata
    const metadata = JSON.parse(await loadData(`${key}.metadata`)) as ChunkDataMetadata;
    
    // Load data chunk after chunk
    let data = '';

    for (let i = 0; i < metadata.chunkCount; i++) {
        data += await loadData(`${key}.${i}`);
    }

    return data;
}