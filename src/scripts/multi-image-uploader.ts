// Custom multi-image uploader for the CloudCannon Visual Editor.
//
// CloudCannon's stock image input adds one file at a time. The <multi-image-uploader>
// element renders an on-canvas dropzone inside each Gallery block that uploads
// *many* files in a single action and appends each to that block's `images`
// array, driving the Visual Editor JavaScript API directly:
//
//   const api = window.CloudCannonAPI.useVersion("v1", true)
//   const url = await api.uploadFile(file, await file.getInputConfig({ slug }))
//   await api.currentFile().data.addArrayItem({ slug, item })
//
// Loaded only inside the editor (see Layout.astro). Set `localStorage.miu-debug
// = "1"` and reload to see verbose `[MIU]` tracing; errors always log.

type CloudCannonFile = {
  data: {
    addArrayItem(opts: {
      slug: string;
      value?: unknown;
      index?: number;
    }): Promise<unknown>;
  };
  // May be sync or async depending on API version — always `await` it.
  getInputConfig?(opts: { slug: string }): unknown | Promise<unknown>;
};

type CloudCannonApi = {
  currentFile(): CloudCannonFile;
  uploadFile(file: File, inputConfig?: unknown): Promise<string>;
};

declare global {
  interface Window {
    inEditorMode?: boolean;
    CloudCannonAPI?: {
      useVersion(version: string, live?: boolean): CloudCannonApi;
    };
  }
}

const DEBUG =
  typeof localStorage !== "undefined" && localStorage.getItem("miu-debug") === "1";
const log = (...args: unknown[]) => DEBUG && console.log("[MIU]", ...args);
const warn = (...args: unknown[]) => console.warn("[MIU]", ...args);

function getApi(): Promise<CloudCannonApi> {
  // window.inEditorMode can be true while window.CloudCannonAPI is still absent,
  // so fall back to the cloudcannon:load event.
  if (window.CloudCannonAPI) {
    return Promise.resolve(window.CloudCannonAPI.useVersion("v1", true));
  }
  return new Promise((resolve) => {
    document.addEventListener(
      "cloudcannon:load",
      () => resolve(window.CloudCannonAPI!.useVersion("v1", true)),
      { once: true },
    );
  });
}

const apiPromise = getApi();

// Resolve a Gallery's images-array element to its absolute data path, e.g.
// `content_blocks.2.images`. Read from the live DOM so it stays correct across
// component re-renders and content_blocks reordering.
function resolveSlug(imagesArray: Element): string | null {
  const blockItem = imagesArray.closest('[data-editable="array-item"]');
  if (!blockItem) return "images"; // Gallery placed outside an array wrapper.

  const contentArray = blockItem.closest('[data-editable="array"]');
  const prop = contentArray?.getAttribute("data-prop");
  if (!contentArray || !prop) {
    warn("[MIU] could not resolve the gallery's data path");
    return null;
  }

  const items = Array.from(
    contentArray.querySelectorAll(':scope > [data-editable="array-item"]'),
  );
  const index = items.indexOf(blockItem);
  if (index < 0) {
    warn("[MIU] could not locate the gallery block's index");
    return null;
  }
  return `${prop}.${index}.images`;
}

// Append one item to an editable array the SAME way the editor's built-in
// "Add Item" button does (editable-array.ts → mount): dispatch a bubbling
// `cloudcannon-api` event on the array element. Each [data-editable] ancestor
// prepends its own data-prop to build the real `source` path, the root node
// executes the write, AND its data-change listener re-renders the grid. This
// is why the raw `currentFile().data.addArrayItem(slug, …)` call never showed
// anything: it bypassed the node graph that drives the live re-render.
function dispatchAddArrayItem(
  imagesArray: Element,
  index: number,
  value: unknown,
): void {
  imagesArray.dispatchEvent(
    new CustomEvent("cloudcannon-api", {
      bubbles: true,
      detail: {
        source: imagesArray.getAttribute("data-prop") ?? "images",
        action: "add-array-item",
        newIndex: index,
        value,
      },
    }),
  );
}

async function uploadAll(
  imagesArray: Element,
  slug: string,
  fileList: FileList,
  onStatus: (text: string) => void,
): Promise<void> {
  const files = Array.from(fileList).filter((f) => f.type.startsWith("image/"));
  if (!files.length) return;

  const api = await apiPromise;
  const file = api.currentFile();

  // getInputConfig may return a Promise — it MUST be awaited to a plain object
  // before uploadFile(), which postMessages it to the parent window (a pending
  // Promise → DataCloneError and the upload silently never runs).
  let inputConfig: unknown;
  try {
    inputConfig = await file.getInputConfig?.({ slug: `${slug}.0.image_path` });
  } catch (e) {
    warn("[MIU] getInputConfig failed (continuing without it):", e);
  }

  // Sequential: keeps append order deterministic and avoids racing the coarse
  // `change` events the API fires on each write.
  let done = 0;
  onStatus(`Uploading 0/${files.length}…`);
  for (const f of files) {
    try {
      const url = await api.uploadFile(f, inputConfig);
      // Append at the current end of the array (count live DOM items).
      const endIndex = imagesArray.querySelectorAll(
        ':scope > [data-editable="array-item"]',
      ).length;
      const value = { image_path: url, alt_text: "" };
      console.log("[MIU] uploaded → dispatching add-array-item", {
        file: f.name,
        url,
        prop: imagesArray.getAttribute("data-prop"),
        newIndex: endIndex,
        slug,
      });
      dispatchAddArrayItem(imagesArray, endIndex, value);
      done++;
    } catch (err) {
      console.error("[MIU] upload/append failed:", f.name, err);
    }
    onStatus(`Uploading ${done}/${files.length}…`);
  }
  onStatus(
    done === files.length
      ? `Added ${done} image${done === 1 ? "" : "s"}.`
      : `Added ${done} of ${files.length} (see console).`,
  );
}

class MultiImageUploader extends HTMLElement {
  private statusEl: HTMLElement | null = null;

  connectedCallback() {
    // Render into shadow DOM, not light DOM. CloudCannon's Visual Editor
    // re-renders the Gallery component from server HTML (empty for this
    // element) and morphs the light-DOM tree — which would strip a
    // light-DOM dropzone, leaving a sized-but-blank (invisible) element.
    // A shadow root is invisible to that morph, so the dropzone survives.
    // `attachShadow` throws if called twice, so guard on an existing root.
    if (this.shadowRoot) return;
    this.render();
  }

  private render() {
    const root = this.attachShadow({ mode: "open" });
    root.innerHTML = `
      <style>
        .miu-zone {
          display: inline-flex; align-items: center; gap: 0.4rem;
          padding: 0.5rem 0.85rem; border-radius: 999px;
          border: 1px solid #c7cdd6; background: rgba(255, 255, 255, 0.95);
          box-shadow: 0 2px 8px rgba(15, 23, 42, 0.15); color: #1e293b;
          font: 600 0.85rem/1 system-ui, sans-serif; white-space: nowrap;
          cursor: pointer; backdrop-filter: blur(4px);
          transition: border-color 0.15s, background 0.15s, box-shadow 0.15s;
        }
        .miu-zone:hover { box-shadow: 0 3px 12px rgba(15, 23, 42, 0.22); }
        /* Whole tile highlights while dragging files anywhere over the gallery. */
        .miu-zone[data-drag="true"] {
          border-color: #2563eb; background: #eff6ff; color: #1d4ed8;
        }
        .miu-icon { font-size: 1.05rem; line-height: 1; }
        .miu-status {
          margin-top: 0.35rem; padding: 0.2rem 0.55rem; border-radius: 0.4rem;
          background: rgba(255, 255, 255, 0.95); box-shadow: 0 2px 8px rgba(15, 23, 42, 0.15);
          font: 500 0.78rem/1.3 system-ui, sans-serif; color: #2563eb;
          text-align: right;
        }
        .miu-status[hidden] { display: none; }
        input { display: none; }
      </style>
      <label class="miu-zone" title="Upload multiple images at once">
        <span class="miu-icon">＋</span>
        <span>Add images</span>
        <input type="file" accept="image/*" multiple />
      </label>
      <div class="miu-status" hidden></div>
    `;

    const zone = root.querySelector<HTMLElement>(".miu-zone")!;
    const input = root.querySelector<HTMLInputElement>("input")!;
    this.statusEl = root.querySelector<HTMLElement>(".miu-status");

    input.addEventListener("change", () => {
      if (input.files?.length) this.upload(input.files);
      input.value = "";
    });

    const setDrag = (on: boolean) => zone.setAttribute("data-drag", String(on));
    ["dragenter", "dragover"].forEach((evt) =>
      zone.addEventListener(evt, (e) => {
        e.preventDefault();
        setDrag(true);
      }),
    );
    ["dragleave", "dragend"].forEach((evt) =>
      zone.addEventListener(evt, () => setDrag(false)),
    );
    zone.addEventListener("drop", (e) => {
      e.preventDefault();
      setDrag(false);
      const files = (e as DragEvent).dataTransfer?.files;
      if (files?.length) this.upload(files);
    });
  }

  private upload(files: FileList) {
    // The dropzone is a sibling of the block's images array.
    const imagesArray = this.parentElement?.querySelector(
      '[data-editable="array"][data-prop="images"]',
    );
    if (!imagesArray) {
      warn("[MIU] could not find this block's images array");
      return;
    }
    const slug = resolveSlug(imagesArray);
    console.log("[MIU] upload starting", {
      files: Array.from(files).map((f) => f.name),
      resolvedSlug: slug,
      arrayProp: imagesArray.getAttribute("data-prop"),
    });
    if (!slug) return;
    uploadAll(imagesArray, slug, files, (t) => {
      if (!this.statusEl) return;
      this.statusEl.textContent = t;
      this.statusEl.hidden = false;
      // Auto-dismiss the floating pill's status once a batch finishes.
      if (/\.$/.test(t)) {
        const el = this.statusEl;
        setTimeout(() => {
          if (el.textContent === t) el.hidden = true;
        }, 4000);
      }
    });
  }
}

if (!customElements.get("multi-image-uploader")) {
  customElements.define("multi-image-uploader", MultiImageUploader);
}

export {};
