# Multi-Image Uploader — editor guide

This site includes a **custom multi-image uploader** built for the CloudCannon
Visual Editor. It lets you add **many images to a gallery at once**, instead of
one at a time.

## Try it

1. Open the **home page** in the **Visual Editor**.
2. Scroll to the **Gallery** block (a grid of images).
3. In the block's **top-right corner** you'll see a floating **"＋ Add images"**
   button.
4. **Click it** to pick multiple files, or **drag and drop** several images onto
   it.

Every image you select is uploaded to the site's media library **and** added to
the gallery grid straight away. A small status label shows progress
("Uploading 2/5…") and confirms when the batch is done.

## Good to know

- **The "＋ Add images" button only appears in the editor.** It is never part of
  the published site, so the grid you see (minus the button) is exactly how the
  gallery looks in production.
- **Order:** new images are appended to the **end** of the gallery. You can
  reorder or delete any image afterwards using CloudCannon's normal array
  controls (drag handles / remove buttons on each item).
- **Alt text:** uploaded images start with empty alt text. Add descriptive alt
  text on each image for accessibility and SEO — click an image to edit it.
- **File types:** only image files are accepted; anything else you drop is
  ignored.

## Adding a gallery to a page

Galleries are a page-building block. On a page that uses content blocks, use the
**Add** control and choose **Gallery**, then use the **"＋ Add images"** button to
populate it.

---

*Developers: implementation details and the techniques behind this uploader are
in the repository's main `README.md` and in `src/scripts/multi-image-uploader.ts`.*
