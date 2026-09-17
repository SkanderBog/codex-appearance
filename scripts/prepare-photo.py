#!/usr/bin/env python3
"""Decode and normalize a local photo, with a size check before pixel decoding."""
import io
import json
import sys
import warnings
from PIL import Image, ImageOps, ImageStat
Image.MAX_IMAGE_PIXELS = 40_000_000
warnings.simplefilter('error', Image.DecompressionBombWarning)
try:
    if sys.argv[1:] not in ([], ['--palette']):
        raise ValueError('Unsupported photo operation.')
    data = sys.stdin.buffer.read(20 * 1024 * 1024 + 1)
    if len(data) > 20 * 1024 * 1024:
        raise ValueError('Choose an image under 20 MB.')
    image = Image.open(io.BytesIO(data))
    if image.format not in ('PNG', 'JPEG', 'WEBP'):
        raise ValueError('Choose a PNG, JPEG, or WebP image.')
    if image.width * image.height > 40_000_000:
        raise ValueError('Choose an image smaller than 40 megapixels.')
    image = ImageOps.exif_transpose(image)
    # Ubuntu 22.04's supported Pillow package predates the Resampling enum.
    resampling = Image.Resampling if hasattr(Image, 'Resampling') else Image
    image.thumbnail((2560, 2560), resampling.LANCZOS)
    # A known matte avoids ambiguous alpha when encoding JPEG. Do not keep EXIF/location metadata.
    if image.mode in ('RGBA', 'LA') or 'transparency' in image.info:
        rgba = image.convert('RGBA')
        matte = Image.new('RGB', image.size, '#11171C')
        matte.paste(rgba, mask=rgba.getchannel('A'))
        image = matte
    else:
        image = image.convert('RGB')
    if sys.argv[1:] == ['--palette']:
        # Sample locally and keep suggestions dark, like the companion's presets.
        image.thumbnail((64, 64), resampling.LANCZOS)
        average = ImageStat.Stat(image).mean
        def color(base, weight):
            return '#' + ''.join(f'{round(base + channel * weight):02X}' for channel in average)
        print(json.dumps({
            'background': color(10, 0.08),
            'foreground': '#F2F5F7',
            'accent': color(145, 0.40),
        }))
    else:
        image.save(sys.stdout.buffer, format='JPEG', quality=88, optimize=True)
except Exception as error:
    print(str(error) if isinstance(error, ValueError) else 'This image could not be opened. Try a different photo.', file=sys.stderr)
    sys.exit(1)
