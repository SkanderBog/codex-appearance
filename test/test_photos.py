import io
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
