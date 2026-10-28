import json
import tempfile
import unittest
from pathlib import Path
from scripts.download_overture_candidates import select_feature, validate_bbox, convert

ID="11111111-2222-4333-8444-555555555555"
class ExportTests(unittest.TestCase):
 def test_preserves_public_dataset_contacts_with_provenance(self):
  feature={"type":"Feature","properties":{"id":ID,"names":{"primary":"Hamburg Freight Forwarder GmbH"},"taxonomy":{"primary":"freight_forwarder","hierarchy":["business","logistics","freight_forwarder"]},"websites":["https://freight.example"],"emails":["Sales@Example.com","invalid-email"],"phones":["+49 40 1234567"],"sources":[{"dataset":"test","license":"ODbL"}]}}
  row=select_feature(feature)
  self.assertEqual(row["id"],ID)
  self.assertEqual(row["emails"],["sales@example.com"])
  self.assertEqual(row["phones"],["+49 40 1234567"])
  self.assertEqual(row["website"],"https://freight.example")
 def test_rejects_irrelevant_place(self):
  self.assertIsNone(select_feature({"id":ID,"names":{"primary":"Cafe Sunshine"},"taxonomy":{"primary":"coffee_shop"}}))
 def test_false_positive_categories_not_exported(self):
  for cat in ("christian_place_of_worship","automotive_repair","car_wash","taxi_service"):
   row={"id":ID,"names":{"primary":"Shipping Test Place"},"taxonomy":{"primary":cat}}
   self.assertIsNone(select_feature(row),cat)
 def test_freight_category_selected_without_keyword_in_name(self):
  row={"id":ID,"names":{"primary":"Acme GmbH"},"taxonomy":{"primary":"freight_forwarding_agency"}}
  self.assertEqual(select_feature(row)["name"],"Acme GmbH")
 def test_word_boundary_does_not_match_worship(self):
  row={"id":ID,"names":{"primary":"Christian Worship Center"},"taxonomy":{"primary":"religious_organization"}}
  self.assertIsNone(select_feature(row))
 def test_parcel_shops_are_not_b2b_leads(self):
  for name in ("Hermes PaketShop","UPS Access Point","Finest Shop"):
   self.assertIsNone(select_feature({"id":ID,"names":{"primary":name},"taxonomy":{"primary":"shipping_center"}}))
 def test_real_transport_business_with_shipping_center_tag_survives(self):
  row={"id":ID,"names":{"primary":"Hamburg Cargo Transport"},"taxonomy":{"primary":"shipping_center"}}
  self.assertEqual(select_feature(row)["name"],"Hamburg Cargo Transport")
 def test_directory_is_not_official_website(self):
  row={"id":ID,"names":{"primary":"Hamburg Spedition"},"taxonomy":{"primary":"freight_forwarding_agency"},"websites":["https://www.gelbeseiten.de/gsbiz/test"]}
  result=select_feature(row)
  self.assertEqual(result["website"],"")
  self.assertEqual(result["lead_tier"],"high" if result["quality_score"]>=65 else "review")
 def test_weak_freight_label_does_not_create_false_lead(self):
  self.assertIsNone(select_feature({"id":ID,"names":{"primary":"Hamburg Kiosk"},"taxonomy":{"primary":"freight_and_cargo_service"}}))
 def test_score_and_screening_are_explanatory(self):
  row={"id":ID,"names":{"primary":"Hamburg Spedition"},"taxonomy":{"primary":"freight_forwarding_agency"},"websites":["https://hamburgsped.example"]}
  result=select_feature(row)
  self.assertGreaterEqual(result["quality_score"],65)
  self.assertTrue(result["needs_review"])
 def test_full_scan_selects_best_not_first(self):
  first={"id":ID,"names":{"primary":"Hans Schwingel"},"taxonomy":{"primary":"wholesaler"}}
  best={"id":"22222222-2222-4222-8222-222222222222","names":{"primary":"Hamburg Spedition"},"taxonomy":{"primary":"freight_forwarding_agency"},"websites":["https://spedition.example"]}
  with tempfile.TemporaryDirectory() as d:
   p=Path(d)/"in.geojsonseq";o=Path(d)/"out.ndjson"
   p.write_text("\n".join([json.dumps(first),json.dumps(best)]))
   result=convert(p,o,1)
   self.assertEqual(result["scanned"],2)
   self.assertEqual(json.loads(o.read_text().splitlines()[0])["name"],"Hamburg Spedition")
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
