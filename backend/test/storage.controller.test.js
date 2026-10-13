const { StorageController } = require('../src/storage/storage.controller');

describe('StorageController management image uploads', () => {
  const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  it.each(['speaker-images', 'media-partner-images'])(
    'stores a signature-validated image in the %s bucket and returns a public local URL',
    async (bucket) => {
    const storage = {
      uploadFile: jest.fn().mockResolvedValue({
        url: `/storage/local/${bucket}/image.png`,
        publicId: `${bucket}/image.png`,
      }),
    };
    const controller = new StorageController(storage);

    await expect(controller.upload(bucket, 'untrusted.png', {
      mimetype: 'image/png',
      buffer: pngHeader,
    })).resolves.toEqual({
      url: `/storage/public/${bucket}/image.png`,
      publicId: `${bucket}/image.png`,
    });
    expect(storage.uploadFile).toHaveBeenCalledWith(pngHeader, expect.stringMatching(/^[0-9a-f-]+\.png$/), bucket);
    },
  );

  it('rejects content that does not match the declared image type', async () => {
    const storage = { uploadFile: jest.fn() };
    const controller = new StorageController(storage);

    await expect(controller.upload('media-partner-images', 'fake.png', {
      mimetype: 'image/png',
      buffer: Buffer.from('<svg></svg>'),
    })).rejects.toThrow('Upload a valid JPEG, PNG, or WebP image');
    expect(storage.uploadFile).not.toHaveBeenCalled();
  });

  it('rejects oversized file content before calling storage', async () => {
    const storage = { uploadFile: jest.fn() };
    const controller = new StorageController(storage);

    await expect(controller.upload('speaker-images', 'large.png', {
      mimetype: 'image/png',
      buffer: Buffer.alloc(5 * 1024 * 1024 + 1),
    })).rejects.toThrow('no larger than 5 MB');
    expect(storage.uploadFile).not.toHaveBeenCalled();
  });

  it('reports provider failures without saving a database URL', async () => {
    const controller = new StorageController({
      uploadFile: jest.fn().mockRejectedValue(new Error('provider unavailable')),
    });

    await expect(controller.upload('media-partner-images', 'logo.png', {
      mimetype: 'image/png',
      buffer: pngHeader,
    })).rejects.toThrow('Image storage is temporarily unavailable');
  });

  it('does not accept unsupported image content through the abstract asset bucket', async () => {
    const controller = new StorageController({ uploadFile: jest.fn() });

    await expect(controller.upload('abstract-assets', 'fake.png', {
      mimetype: 'image/svg+xml',
      buffer: Buffer.from('<svg></svg>'),
    })).rejects.toThrow('Unsupported file type');
  });

  it('exposes only allowlisted local image assets and marks them inline', async () => {
    const storage = { getLocalFile: jest.fn().mockResolvedValue(pngHeader) };
    const controller = new StorageController(storage);
    const response = { setHeader: jest.fn(), send: jest.fn() };

    await controller.servePublicImage('speaker-images', { path: 'image.png' }, response);

    expect(storage.getLocalFile).toHaveBeenCalledWith('speaker-images/image.png');
    expect(response.setHeader).toHaveBeenCalledWith('Content-Type', 'image/png');
    expect(response.setHeader).toHaveBeenCalledWith('X-Content-Type-Options', 'nosniff');
    expect(response.send).toHaveBeenCalledWith(pngHeader);
    await expect(controller.servePublicImage('abstract-assets', { path: 'private.pdf' }, response))
      .rejects.toThrow('Stored image was not found');
  });
});
