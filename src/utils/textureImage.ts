// Textures are sampled onto an object that occupies a few hundred pixels on
// screen, so a full-resolution photo is almost entirely wasted memory — and
// unlike a collage image, it lives on the GPU as uncompressed pixels. Capping
// the longest edge keeps an uploaded texture in the low megabytes while
// staying sharp at any realistic object size.
const MAX_TEXTURE_DIM = 1024;

export function fileToTextureDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read the texture file.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Could not decode the texture image.'));
      img.onload = () => {
        const scale = Math.min(MAX_TEXTURE_DIM / img.naturalWidth, MAX_TEXTURE_DIM / img.naturalHeight, 1);
        if (scale === 1) {
          resolve(String(reader.result));
          return;
        }
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(String(reader.result));
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/png'));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}
