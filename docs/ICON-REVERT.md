# Reverting emoji → SVG icons

User controls bar icons live in `client/src/components/UiIcons.tsx` and are used by `UserControlsBar.tsx`. Channel list type icons (`IconHash`, `IconHeadphones`) use the same file from `ChannelList.tsx`. Empty chat placeholders use `ChatEmptyState.tsx`.

To roll back to emoji-only buttons:

1. In `UserControlsBar.tsx`, remove imports from `./UiIcons` and restore the previous button contents (emoji characters and `▼` for chevrons), **or**
2. From the repo root: `git checkout HEAD -- client/src/components/UserControlsBar.tsx client/src/components/UiIcons.tsx` (after committing your current state if you want to keep a copy).

No build or dependency changes are required for the icon swap.
