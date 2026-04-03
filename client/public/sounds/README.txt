Place voice notification files HERE — client/public/sounds/

Vite copies this folder into client/dist/sounds/ on every build, then the release
script copies dist to release/public. Do not rely on dropping files only into
release/public/sounds/ (they can be lost on older builds; the release script
now merges extra files from the previous release/public/sounds if missing from dist).

Suggested filenames (tried in order):
  voice-join.mp3, voice-join.webm, join.mp3
  voice-leave.mp3, voice-leave.webm, leave.mp3

If no file loads, the app falls back to built-in beeps (Settings presets: chime, pop, etc.).

Rename your files to match one of the names above (first match wins). In dev, sounds load
from the same origin as the chat UI (e.g. Vite :5173), not only the API port.
