// 사진 줄이기: 폰에서 고른 사진을 기록용(긴 변 1600px, 약 0.3MB)과
// 미리보기용(긴 변 480px, 약 40KB) 두 가지 JPEG로 만들어요. 원본은 폰에 그대로 남아요.
(function () {
  async function decode(file) {
    if (window.createImageBitmap) {
      try { return await createImageBitmap(file, { imageOrientation: "from-image" }); } catch (e) { /* fall through */ }
      try { return await createImageBitmap(file); } catch (e) { /* fall through */ }
    }
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.decoding = "async";
      img.src = url;
      await img.decode();
      return img;
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  }

  function toBlob(canvas, q) {
    return new Promise((res, rej) => canvas.toBlob(b => (b ? res(b) : rej(new Error("이미지를 만들지 못했어요"))), "image/jpeg", q));
  }

  async function render(src, maxSide, targetBytes) {
    const sw = src.width || src.naturalWidth, sh = src.height || src.naturalHeight;
    const scale = Math.min(1, maxSide / Math.max(sw, sh));
    let w = Math.max(1, Math.round(sw * scale)), h = Math.max(1, Math.round(sh * scale));
    const c = document.createElement("canvas");
    let blob;
    for (let attempt = 0; attempt < 3; attempt++) {
      c.width = w; c.height = h;
      const ctx = c.getContext("2d");
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(src, 0, 0, w, h);
      for (const q of [0.82, 0.74, 0.66, 0.58, 0.5]) {
        blob = await toBlob(c, q);
        if (blob.size <= targetBytes) return { blob, w, h };
      }
      w = Math.round(w * 0.85); h = Math.round(h * 0.85);
    }
    return { blob, w, h };
  }

  async function compress(file) {
    const src = await decode(file);
    const full = await render(src, 1600, 340 * 1024);
    const thumb = await render(src, 480, 48 * 1024);
    if (src.close) src.close();
    return { full: full.blob, thumb: thumb.blob, width: full.w, height: full.h };
  }

  window.ImageTools = { compress };
})();
