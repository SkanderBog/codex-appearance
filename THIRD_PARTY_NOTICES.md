# Third-party material

Three included looks adapt artwork and theme data from [Codex Habitat](https://github.com/wp-a/CodexHabitat/tree/71a38c09610432d91c582006867b82ffd8fd8529), by Codex Habitat contributors:

- Cathedral Foundry (`workbench`)
- Arcade Signal (`arcade-signal`)
- Night Shift (`night-shift`)

Their original theme directories each declare MIT in `habitat.json` and include the same copyright and license text, retained in [assets/themes/LICENSE](assets/themes/LICENSE). Background JPEGs retain their original compressed pixels; EXIF, XMP, Photoshop metadata, and comment segments are removed where present. `assets/themes/catalog.json` adapts their colors, focal points, blur, artwork strength, and panel opacity to this companion's settings. The catalog records both upstream and packaged SHA-256 hashes; packaged hashes are checked before applying a bundled look. This is not a complete implementation of Habitat's visual style families or banner modes.

Habitat documents the backgrounds as generated original scenery in its [asset provenance](https://github.com/wp-a/CodexHabitat/blob/71a38c09610432d91c582006867b82ffd8fd8529/docs/qa/theme-asset-provenance.md). The three selected images were visually reviewed for this release. Exporting a look with one of these backgrounds includes its attribution and MIT license text; importing and re-exporting retains that attribution.

No Habitat Swift implementation, application bundle, pet artwork, or third-party runtime is included. The companion's application changes are independently implemented. The license attached to these theme assets does not establish a license for the rest of Habitat's repository.
