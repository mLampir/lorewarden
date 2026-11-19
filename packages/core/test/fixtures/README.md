# File fixtures

Files as each version of Lorewarden wrote them, one per format and version. They are never
changed: `test/file-format.test.ts` reads every file here, so a change to a file format that
needs a migration step fails until the step is there. When a format's version goes up, add a
file of the new version next to the old ones.

`v1.adventure.json` is a copy of the example adventure in `examples/`, under the same license
(CC BY 4.0).
