# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- A flush no longer leaves a file open when entries are appended while it writes.
- An entry appended while a flush closes the file is written by that flush, not left for the next one.
- A write that fails without writing anything leaves the file a valid JSON array, and a later flush appends to it as usual.
- A flush writes the rest of its entries when the file system writes only part of them.
- An append after an entry with non-ASCII text keeps the file valid JSON: the writer finds the closing bracket by bytes.

### Changed

- **Breaking:** a flush writes at positions inside the file, so a custom `fileOpen` must not open it in append mode. On Linux such a handle writes at the end whatever the position, which corrupts the array. With `initArray`, `fileOpen` receives the flags `O_RDWR | O_CREAT`, otherwise `r+`.
- `MinimalFileHandle` no longer needs `truncate`.
- `InMemoryFileHandle` keeps its content as bytes, as a file does, writes a `Buffer` too, and reads no bytes past the end.

## 1.2.2 - 2025-06-29

### Fixed

- Import paths in documentation

## 1.2.0 - 2025-06-29

### Added

- Fire-and-forget mode

### Fixed

- Refine NPM files to publish pattern to include `InMemoryFileHandle`

## 1.1.0 - 2025-06-29

- First release
