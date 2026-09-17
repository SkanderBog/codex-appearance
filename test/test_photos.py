import io
import json
from pathlib import Path
import struct
import subprocess
import sys
import unittest
import zlib
from PIL import Image
ROOT = Path(__file__).resolve().parents[1]
def convert(data):
    return subprocess.run([sys.executable, str(ROOT / 'scripts/prepare-photo.py')], input=data, capture_output=True, timeout=20)
class PhotoTests(unittest.TestCase):
    def test_photo_palettes_are_local_bounded_and_readable(self):
        def luminance(value):
            channels = [int(value[i:i+2], 16) / 255 for i in (1, 3, 5)]
            linear = [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in channels]
            return sum(c * w for c, w in zip(linear, (0.2126, 0.7152, 0.0722)))
        palettes = []
        for color in ('black', 'white', 'red', 'blue'):
            stream = io.BytesIO()
            Image.new('RGB', (30, 20), color).save(stream, format='PNG')
            result = subprocess.run([sys.executable, str(ROOT / 'scripts/prepare-photo.py'), '--palette'],
                                    input=stream.getvalue(), capture_output=True, timeout=20)
            self.assertEqual(result.returncode, 0, result.stderr)
            palette = json.loads(result.stdout)
            self.assertEqual(set(palette), {'background', 'foreground', 'accent'})
            for value in palette.values():
                self.assertRegex(value, r'^#[0-9A-F]{6}$')
            for key in ('foreground', 'accent'):
                contrast = (luminance(palette[key]) + 0.05) / (luminance(palette['background']) + 0.05)
                self.assertGreaterEqual(contrast, 4.5)
            palettes.append(palette)
        self.assertNotEqual(palettes[2], palettes[3])
        result = subprocess.run([sys.executable, str(ROOT / 'scripts/prepare-photo.py'), '--palette'],
                                input=b'not an image', capture_output=True, timeout=20)
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(result.stdout)
    def test_png_and_webp_become_bounded_jpeg(self):
        for ext in ['png', 'webp']:
            result = convert((ROOT / f'test/fixtures/background.{ext}').read_bytes())
            self.assertEqual(result.returncode, 0, result.stderr)
            image = Image.open(io.BytesIO(result.stdout))
            self.assertEqual(image.format, 'JPEG')
            self.assertLessEqual(max(image.size), 2560)
    def test_oversized_dimensions_rejected_before_decode(self):
        def chunk(kind, content):
            return struct.pack('>I',len(content))+kind+content+struct.pack('>I',zlib.crc32(kind+content)&0xffffffff)
        data=b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>2I5B',40001,1001,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(b''))+chunk(b'IEND',b'')
        result=convert(data)
        self.assertNotEqual(result.returncode,0)
        self.assertFalse(result.stdout)
    def test_exif_rotation_preserved_and_metadata_removed(self):
        image=Image.new('RGB',(20,30),'red');exif=Image.Exif();exif[274]=6;exif[270]='private caption'
        stream=io.BytesIO();image.save(stream,format='JPEG',exif=exif)
        result=convert(stream.getvalue());self.assertEqual(result.returncode,0,result.stderr)
        output=Image.open(io.BytesIO(result.stdout));self.assertEqual(output.size,(30,20));self.assertFalse(output.getexif())
    def test_bad_image_rejected(self):
        result=convert(b'not an image');self.assertNotEqual(result.returncode,0);self.assertFalse(result.stdout)
