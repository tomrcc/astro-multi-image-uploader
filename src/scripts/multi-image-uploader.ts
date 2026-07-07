// Custom multi-image uploader for the CloudCannon Visual Editor.
//
// CloudCannon's stock image input adds one file at a time. This web component
// renders an on-canvas dropzone that uploads *many* files in a single action
// and appends each to the enclosing Gallery block's `images` array, driving the
// Visual Editor JavaScript API directly:
//
//   const api = window.CloudCannonAPI.useVersion("v1", true)
//   const url = await api.uploadFile(file, inputConfig)
//   await api.currentFile().data.addArrayItem({ slug, item })
//
// Loaded only inside the editor (see Layout.astro). Verbose `[MIU]` logging is
// intentional for this PoC — it makes every step observable in the console.

type CloudCannonFile = {
  data: {
    addArrayItem(opts: { slug: string; item?: unknown }): Promise<unknown>;
  };
  getInputConfig?(opts: { slug: string }): unknown;
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

const log = (...args: unknown[]) => console.log("[MIU]", ...args);
const warn = (...args: unknown[]) => console.warn("[MIU]", ...args);

log(
  `module evaluating — inEditorMode=${window.inEditorMode}, CloudCannonAPI present=${!!window.CloudCannonAPI}`,
);

function getApi(): Promise<CloudCannonApi> {
  const resolveApi = () => {
    const api = window.CloudCannonAPI!.useVersion("v1", true);
    log("CloudCannon API acquired via useVersion('v1', true)");
    return api;
  };
  if (window.CloudCannonAPI) return Promise.resolve(resolveApi());
  log("CloudCannonAPI not present yet — waiting for cloudcannon:load");
  return new Promise((resolve) => {
    document.addEventListener(
      "cloudcannon:load",
      () => resolve(resolveApi()),
      { once: true },
    );
  });
}

class MultiImageUploader extends HTMLElement {
  private apiPromise?: Promise<CloudCannonApi>;
  private statusEl: HTMLElement | null = null;

  connectedCallback() {
    log("connectedCallback — rendering dropzone UI");
    this.render();
    this.apiPromise = getApi();

    // Report visibility so we can tell "not loaded" from "loaded but hidden".
    requestAnimationFrame(() => {
      const rect = this.getBoundingClientRect();
      const visible = rect.width > 0 && rect.height > 0;
      log(
        `mounted — size=${Math.round(rect.width)}x${Math.round(rect.height)}, visible=${visible}, body.class="${document.body.className}"`,
      );
      if (!visible) {
        warn(
          "dropzone has zero size — likely hidden by CSS (check the `multi-image-uploader:defined` rule is present) or the gallery isn't laid out yet",
        );
      }
    });
  }

  private render() {
    this.innerHTML = `
      <style>
        .miu-zone {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 0.25rem;
          padding: 1.5rem;
          border: 2px dashed #c7cdd6;
          border-radius: 0.75rem;
          background: #f8fafc;
          color: #475569;
          font: 500 0.95rem/1.4 system-ui, sans-serif;
          text-align: center;
          cursor: pointer;
          transition: border-color 0.15s, background 0.15s;
        }
        .miu-zone[data-drag="true"] { border-color: #2563eb; background: #eff6ff; }
        .miu-zone strong { color: #1e293b; }
        .miu-hint { font-size: 0.8rem; color: #64748b; }
        .miu-status { font-size: 0.8rem; color: #2563eb; min-height: 1.1em; }
        .miu-zone input { display: none; }
      </style>
      <label class="miu-zone" part="zone">
        <span>⬆ <strong>Drop images here</strong> or click to select</span>
        <span class="miu-hint">Upload multiple at once</span>
        <span class="miu-status"></span>
        <input type="file" accept="image/*" multiple />
      </label>
    `;

    const zone = this.querySelector<HTMLElement>(".miu-zone")!;
    const input = this.querySelector<HTMLInputElement>("input")!;
    this.statusEl = this.querySelector<HTMLElement>(".miu-status");

    input.addEventListener("change", () => {
      log(`file input change — ${input.files?.length ?? 0} file(s) selected`);
      if (input.files?.length) this.handleFiles(input.files);
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
      log(`drop — ${files?.length ?? 0} file(s)`);
      if (files?.length) this.handleFiles(files);
    });
  }

  private setStatus(text: string) {
    if (this.statusEl) this.statusEl.textContent = text;
  }

  // Resolve this uploader's target array path from the live DOM, e.g.
  // `content_blocks.2.images`. Reading it from the DOM at action time keeps it
  // correct across component re-renders and content_blocks reordering.
  private resolveSlug(): string | null {
    const blockItem = this.closest('[data-editable="array-item"]');
    if (!blockItem) {
      log('resolveSlug — no [data-editable="array-item"] ancestor; using "images"');
      return "images"; // Gallery placed outside an array wrapper.
    }

    const arrayEl = blockItem.closest('[data-editable="array"]');
    const arrayProp = arrayEl?.getAttribute("data-prop");
    if (!arrayEl || !arrayProp) {
      warn("resolveSlug — found array-item but no enclosing array/data-prop");
      return null;
    }

    const items = Array.from(
      arrayEl.querySelectorAll(':scope > [data-editable="array-item"]'),
    );
    const index = items.indexOf(blockItem);
    if (index < 0) {
      warn("resolveSlug — could not locate this item's index in its array");
      return null;
    }

    const slug = `${arrayProp}.${index}.images`;
    log(`resolveSlug — ${slug}`);
    return slug;
  }

  private async handleFiles(fileList: FileList) {
    const files = Array.from(fileList).filter((f) =>
      f.type.startsWith("image/"),
    );
    log(`handleFiles — ${files.length} image file(s) after filtering`);
    if (!files.length) return;

    const slug = this.resolveSlug();
    if (!slug) {
      this.setStatus("Couldn't locate this gallery's data path.");
      return;
    }

    const api = await this.apiPromise!;
    const file = api.currentFile();

    let inputConfig: unknown;
    try {
      inputConfig = file.getInputConfig?.({ slug: `${slug}.0.image_path` });
      log("getInputConfig →", inputConfig);
    } catch (e) {
      warn("getInputConfig threw (continuing without it):", e);
      inputConfig = undefined;
    }

    // Sequential: keeps append order deterministic and avoids racing the
    // coarse `change` events the API fires on each write.
    let done = 0;
    this.setStatus(`Uploading 0/${files.length}…`);
    for (const f of files) {
      try {
        log(`uploadFile → ${f.name} (${f.type}, ${f.size} bytes)`);
        const url = await api.uploadFile(f, inputConfig);
        log(`uploadFile ← ${f.name} => ${url}`);
        await file.data.addArrayItem({
          slug,
          item: { image_path: url, alt_text: "" },
        });
        log(`addArrayItem ✓ ${slug} += ${url}`);
        done++;
      } catch (err) {
        console.error("[MIU] upload/append FAILED:", f.name, err);
      }
      this.setStatus(`Uploading ${done}/${files.length}…`);
    }

    log(`handleFiles complete — ${done}/${files.length} added`);
    this.setStatus(
      done === files.length
        ? `Added ${done} image${done === 1 ? "" : "s"}.`
        : `Added ${done} of ${files.length} (see console for errors).`,
    );
  }
}

if (!customElements.get("multi-image-uploader")) {
  customElements.define("multi-image-uploader", MultiImageUploader);
  log("customElements.define('multi-image-uploader') done");
} else {
  log("multi-image-uploader already defined — skipping");
}

// Surface how many gallery uploaders exist on the page right now.
requestAnimationFrame(() => {
  const count = document.querySelectorAll("multi-image-uploader").length;
  log(`${count} <multi-image-uploader> element(s) in the DOM`);
  if (count === 0) {
    warn(
      "no <multi-image-uploader> elements found — is there a Gallery block on this page? (the home page seed has one)",
    );
  }
});

export {};
