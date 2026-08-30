# Changelog

## Unreleased
- Bounded short database text fields, enforced unique product names per household, and removed obsolete legacy import structures from the baseline.
- Inventory categories are now configurable per household through a normalized, versioned catalogue included in the installation baseline.
- Inventory items can now contain up to 10 JPEG or PNG images, with gallery navigation, multiple uploads, cover selection, and per-image deletion.
- Fixed CSP-blocked local image previews and made the inventory image picker a clear, full-size action.
- Inventory now has separate active and archived sections, with restore for archived items and permanent deletion for active or archived items, including private image cleanup.
- Documents can now contain up to 10 private PDF, JPEG, or PNG attachments, with multi-file create and append flows.
- Product deletion footnotes now span the full confirmation dialog width on desktop.

- Shopping tabs now wrap across rows on narrow screens instead of scrolling horizontally.
- Selecting a recipe on mobile now scrolls its detail panel below the sticky header.
- Product photos are now resized to a 960 px maximum edge and JPEG-compressed before upload.
- Product deletion confirmations now list every active recipe whose ingredient link will be removed.
- Split the Shopping catalogue into Products, Categories, and Supermarkets tabs with aligned card-based management views and quick product add-to-list actions.
- Added category and supermarket renaming, deletion impact summaries, and category reassignment for linked products.
- Added a mobile-friendly recipe ingredient wizard with outside-click dismissal, duplicate prevention, and quick product creation in the Shopping catalogue.
- Migrated the backend from PHP 7.4.33 to PHP 8.5, with PHP 8.5.6 as the minimum supported runtime.
- Initial Life Hub application implementation.
- Added the PHP 7.4.33 API, Angular PWA, MySQL schema, automated tests, build and deployment tooling.
- Added native initialization commands for an empty database and the first administrator account.
