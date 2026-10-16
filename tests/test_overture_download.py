import json
import tempfile
import unittest
from pathlib import Path
from scripts.download_overture_candidates import select_feature, validate_bbox, convert

ID="11111111-2222-4333-8444-555555555555"
class ExportTests(unittest.TestCase):
 def test_selects_logistics_and_strips_contact_data(self):
  feature={"type":"Feature","properties":{"id":ID,"names":{"primary":"Hamburg Freight Forwarder GmbH"},"taxonomy":{"primary":"freight_forwarder","hierarchy":["business","logistics","freight_forwarder"]},"websites":["https://freight.example"],"emails":["ceo@example.com"],"sources":[{"dataset":"test","license":"ODbL"}]}}
  row=select_feature(feature)
  self.assertEqual(row["id"],ID)
  self.assertEqual(row["emails"],[])
  self.assertEqual(row["website"],"https://freight.example")
 def test_rejects_irrelevant_place(self):
  self.assertIsNone(select_feature({"id":ID,"names":{"primary":"Cafe Sunshine"},"taxonomy":{"primary":"coffee_shop"}}))
 def test_validates_small_bbox(self):
  self.assertEqual(validate_bbox("9.75,53.40,10.33,53.72"),"9.75,53.40,10.33,53.72")
  with self.assertRaises(ValueError):validate_bbox("-180,-90,180,90")
 def test_convert_dedupes(self):
  row={"type":"Feature","properties":{"id":ID,"names":{"primary":"Hamburg Logistics"},"basic_category":"logistics"}}
  with tempfile.TemporaryDirectory() as d:
   p=Path(d)/"sample.geojsonseq";o=Path(d)/"out.ndjson"
   p.write_text("\n".join([json.dumps(row),json.dumps(row),json.dumps({"properties":{"id":ID,"names":{"primary":"Cafe"}}})]))
   result=convert(p,o,100)
   self.assertEqual(result["matched"],1)
   self.assertEqual(len(o.read_text().splitlines()),1)

if __name__=="__main__":
 unittest.main()
