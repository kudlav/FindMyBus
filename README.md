<p align="center"><img src=".README_ASSETS/icon.svg" alt="FindMyBus icon" width="86"></p>

<h1 align="center">FindMyBus</h1>
<p align="center">
    FindMyBus is an open-source Android application that allows you to view public transport vehicles positions on a map in real time. <br>
    Built with <a href="https://svelte.dev/">Svelte</a>, <a href="https://konstaui.com/">KonstaUI</a> and <a href="https://capacitorjs.com/">Capacitor</a>. <br>
    <a href="https://f-droid.org/en/packages/com.jakubhlavacek.gtfsrealtimemap/">
      <img alt="Get it on F-Droid" src="https://fdroid.gitlab.io/artwork/badge/get-it-on.png" height="75">
    </a>
</p>

# Features

- Visualize GTFS Realtime feeds on a map
- See live positions of vehicles and extra information about them, such as their timetables
- Light data usage

## Installation

- Install the app and keep it up to date through [F-Droid](https://f-droid.org/en/packages/com.jakubhlavacek.gtfsrealtimemap/)
- Or, download and install an `.apk` file from the [Releases](https://github.com/TriLinder/FindMyBus/releases/latest) page
- Alternatively, you can build the app from source yourself (see below)

# Screenshots

<p align="center">
    <img alt="A map showing the position of different public transport vehicles" src=".README_ASSETS/screenshots/track.webp" width="250" />
    <img alt="A dialog showing the departure times for each stop of a specific selected bus" src=".README_ASSETS/screenshots/timetable.webp" width="250" />
    <img alt="A map showing a street with a bus stop on each side, with one side highlighted to show the user on which side of the street to wait for the bus" src=".README_ASSETS/screenshots/stop_highlight.webp" width="250" />
</p>

# Building

Prerequisites: Android Studio and Node.js (v22)

1. Clone the repository
2. Run `npm install` in the directory to install project dependencies
3. Run `npm run dev` to debug the application in a web browser
    - While running in a web browser, it might be necessary to temporarily [disable CORS protection](https://addons.mozilla.org/en-US/firefox/addon/cors-everywhere/) for the application to be able to reach your transport agency's GTFS feeds. **Please make sure to enable it again as soon as possible afterward.** As an alternative, download and host the GTFS files on a localhost webserver yourself.
4. Run `npm run android` to build the web files and open the application in Android studio
5. Build the application in Android Studio
