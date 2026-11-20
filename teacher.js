function reprocessLoadedImage() {
  const img = state.rawLoadedImg;
  if (!img) return;

  const removeBlack = document.getElementById('remove-black-bg').checked;
  let maxDim = 960; // Keeps each frame crisp on multi-column sheets
  let quality = 0.85;
  let dataUrl = '';

  while (maxDim >= 360) {
    const canvas = document.createElement('canvas');
    let w = img.width, h = img.height;
    if (w > maxDim || h > maxDim) {
      const ratio = Math.min(maxDim / w, maxDim / h);
      w = Math.round(w * ratio);
      h = Math.round(h * ratio);
    }

    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, 0, 0, w, h);

    if (removeBlack) {
      const imgData = ctx.getImageData(0, 0, w, h);
      const d = imgData.data;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i] < 16 && d[i + 1] < 16 && d[i + 2] < 16) {
          d[i + 3] = 0;
        }
      }
      ctx.putImageData(imgData, 0, 0);
    }

    dataUrl = canvas.toDataURL('image/webp', quality);
    if (dataUrl.length < 48500) break;
    maxDim -= 100;
    quality -= 0.08;
  }

  state.pendingImageBase64 = dataUrl;
  document.getElementById('upload-preview-box').classList.remove('hidden');
  updateAnimatedPreview();
}
