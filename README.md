# CloudCannon Multi-Image Uploader Demo

A small Astro + [CloudCannon](https://cloudcannon.com/) site that demonstrates a
**custom multi-image uploader** for the Visual Editor.

CloudCannon's stock image input adds **one file at a time**. This repo shows how
to build a drop-in web component that lets an editor **select or drag many images
at once** — every file is uploaded to the site's media *and* added to a Gallery's
image grid live, without leaving the page.

> **The demo:** open the home page in the Visual Editor. The **Gallery** block has
> a floating **"＋ Add images"** pill in its top-right corner. Select or drop
> several images and watch them upload and fill the grid in one go.

---

## What this demonstrates

Three techniques that are reusable in any CloudCannon + Editable Regions project:

1. **Multi-file upload via the Visual Editor JS API.** `window.CloudCannonAPI`
   exposes `uploadFile()`, which we call once per selected file to push the bytes
   into the site's media and get back a URL.

2. **Live grid updates by re-using the editor's own event.** The array grid only
   re-renders if you mutate it the way CloudCannon does internally. Instead of
   calling the raw `addArrayItem` API (which writes the data but never repaints),
   we dispatch the **same bubbling `cloudcannon-api` event** the built-in
   "Add Item" button fires. Each `[data-editable]` ancestor builds the real data
   path, and the array node re-renders — so new images appear instantly.

3. **Shadow-DOM UI that survives re-renders.** CloudCannon re-renders components
   by morphing the light DOM against server HTML. A dropzone rendered into the
   light DOM gets stripped on the next re-render (leaving an invisible,
   sized-but-blank element). Rendering into a **shadow root** keeps the UI
   invisible to that morph, so it persists.

## How it works

| File | Role |
| --- | --- |
| `src/scripts/multi-image-uploader.ts` | The `<multi-image-uploader>` web component: the floating pill UI, upload loop, and the `cloudcannon-api` event dispatch. Heavily commented. |
| `src/components/gallery/gallery.astro` | The Gallery block. Renders the `images` array as a grid and places `<multi-image-uploader>` as a floating, editor-only sibling of the array. |
| `src/scripts/register-components.ts` | Registers `Gallery` for live re-rendering and imports the uploader — **loaded only inside the editor**. |
| `src/layouts/Layout.astro` | Loads the editor-only scripts when `window.inEditorMode` is set (with a `cloudcannon:load` fallback). |
| `cloudcannon.config.yml` | Defines the `Gallery` content block and its `gallery_images` structure (`image_path` + `alt_text`). |

The flow when an editor selects files:

```
select/drop files
      │
      ▼
uploadAll()  ──►  api.uploadFile(file)               // 1. upload bytes → URL
      │
      ▼
dispatchAddArrayItem(imagesArray, index, {image_path, alt_text})
      │                                              // 2. bubbling cloudcannon-api event
      ▼
CloudCannon builds the data path, writes the item, and re-renders the grid live
```

Key gotchas worth knowing (all documented inline in the source):

- `file.getInputConfig({slug})` may return a **Promise** — you must `await` it
  before `uploadFile()`, or the args fail to structured-clone across the
  `postMessage` boundary (`DataCloneError`) and the upload silently never runs.
- The new item's data goes under `value` (not `item`) in the event detail —
  matching the editor's built-in add button.
- The uploader is gated on `multi-image-uploader:defined` so it only shows inside
  the editor (the element is only ever registered there) and never in production.

Set `localStorage.miu-debug = "1"` and reload to see verbose `[MIU]` tracing in
the console; errors always log.

## Add this to your own site

This works in any Astro site using CloudCannon **Editable Regions**. Steps:

1. **Copy the uploader** `src/scripts/multi-image-uploader.ts` into your project.

2. **Load it editor-only.** Import it from the same editor-only entrypoint that
   registers your components (see `src/scripts/register-components.ts`, loaded by
   `src/layouts/Layout.astro` when `window.inEditorMode` is set). Loading it only
   in the editor means the `<multi-image-uploader>` element is never defined in
   production, so the pill never ships.

3. **Add the pill to your gallery component.** In the component's `.astro`
   template:
   - place `<multi-image-uploader></multi-image-uploader>` as a **sibling of the
     `data-editable="array"` element** (not inside it — the array re-render would
     strip it),
   - wrap them in a `position: relative` container so the pill anchors to the
     corner,
   - add the `multi-image-uploader { display:none }` / `:defined { … }` CSS so the
     pill is editor-only and floats in the corner (see `gallery.astro`).

4. **Match your editable markup and field names.** The uploader expects the array
   to be marked up as `data-editable="array" data-prop="images"` with items as
   `data-editable="array-item"`. If your array prop or item fields differ, adjust:
   - the `[data-prop="images"]` selector in `upload()`,
   - the item shape `{ image_path, alt_text }` in `uploadAll()`,
   - the `getInputConfig` slug field.

5. **Test in the Visual Editor, with debug logging on.** The uploader is silent
   by default, so turn on its tracing while you check the wiring:
   - Open the browser dev tools **on the site preview** (right-click inside the
     preview area → *Inspect*).
   - In that console, run `localStorage.miu-debug = "1"` and reload the editor.
   - Add a few images with the pill. You should now see `[MIU] …` log lines as it
     uploads and appends, and — the actual success check — the gallery's array
     gains the new items **and** the grid updates on the page without a reload.

   The flag is only a diagnostic; the uploader works the same without it. Turn it
   off again with `localStorage.removeItem("miu-debug")`.

> **Not on Editable Regions?** If your site uses **Bookshop** (e.g. Jekyll), the
> data-writing mechanism is different — see the `jekyll-multi-image-uploader`
> sibling repo, which writes via `window.CloudCannon.set` rather than dispatching
> the `cloudcannon-api` event.

---

## Getting started

### Local development

```bash
npm install
npm run dev
```

The uploader only activates inside CloudCannon's Visual Editor (it needs the
`window.CloudCannonAPI`), so to exercise it end-to-end you'll connect the repo to
CloudCannon (below) and open the home page in the visual editor.

### CloudCannon setup

Connect your repository and CloudCannon will detect the configuration in
`.cloudcannon/initial-site-settings.json` and build the site automatically. The
editing experience is defined in `cloudcannon.config.yml`. Editor-facing usage
notes live in `.cloudcannon/README.md` (shown inside the CloudCannon app).

## About the base starter

This project is built on CloudCannon's Astro Editable Regions starter, which also
demonstrates:

- Visual editing with [Editable Regions](https://cloudcannon.com/documentation/developer-guides/set-up-visual-editing/an-overview-of-editable-regions/) — text, image, array, source, and component regions
- Page building with reusable components (Hero, LeftRight, TextBlock, Gallery)
- A blog with pagination and tags
- [Tailwind CSS v4](https://tailwindcss.com/), SEO controls, and Pagefind search

Components that need live re-rendering are registered in
`src/scripts/register-components.ts` and loaded only inside the Visual Editor.

## Project structure

```
├── .cloudcannon/          # CloudCannon schemas, postbuild, and editor README
├── cloudcannon.config.yml # CloudCannon configuration (Gallery block lives here)
├── data/                  # Site-wide data files
├── public/                # Static assets
└── src/
    ├── components/         # Astro components (gallery/ has the uploader host)
    ├── content/            # Content collections (pages, blog)
    ├── layouts/            # Page layouts (Layout.astro loads editor scripts)
    ├── pages/              # Astro page routes
    ├── scripts/            # multi-image-uploader.ts + register-components.ts
    └── styles/             # Global CSS (Tailwind v4)
```
