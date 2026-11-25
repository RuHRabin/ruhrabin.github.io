# Optional real recordings

By default every sound on the site is synthesized live. If you'd rather use real recordings, drop CC0 or properly licensed files in this folder and list them in `manifest.json`. The site will use them instead.

```json
{ "files": { "key": ["key1.mp3", "key2.mp3"], "space": ["space.mp3"], "enter": ["enter.mp3"], "click": ["click.mp3"], "whoosh": ["whoosh.mp3"], "ambient": ["space-drone.mp3"], "music": ["theme.mp3"] } }
```

A good free source is freesound.org (filter by CC0). Keep each file under about 100 KB, and the ambient loop under 1 MB.

The `music` entry replaces the generated score with a looping track.
