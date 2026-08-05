# Workspace project mapping

- This repository is the active tracking frontend.
- "Anaconda GPS Front", "Anaconda GPS", and "NovaTrack Front" refer to this `novatrack-front` repository.
- The tracking backend is the `anaconda-traccar` repository at `/Users/emmanuel/Documents/GitHub/traccar`, using the `anaconda` remote.
- Do not implement Anaconda GPS / NovaTrack frontend changes in `traccar-web` or `anaconda-tracking`.
- `anaconda-tracking` is the marketing website, not the tracking application.
- Do not deploy frontend changes unless the user explicitly requests deployment; the user normally tests this frontend locally.
