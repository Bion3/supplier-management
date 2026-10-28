import math
import unittest
from unittest.mock import patch
from types import SimpleNamespace
from scripts.run_map_search_queue import tiles, keyword_matches, current_release, process
class MapQueueTests(unittest.TestCase):
 def test_hamburg_50km_full_coverage_bounded_boxes(self):
  result=tiles(53.5511,9.9937,50)
  self.assertLessEqual(len(result),16)
  west=min(float(box.split(',')[0]) for box in result)
  south=min(float(box.split(',')[1]) for box in result)
  east=max(float(box.split(',')[2]) for box in result)
  north=max(float(box.split(',')[3]) for box in result)
  self.assertLess(south,53.5511-50/111.2+0.0001)
  self.assertGreater(north,53.5511+50/111.2-0.0001)
  self.assertLess(west,9.9937-50/(111.2*math.cos(math.radians(53.5511)))+0.0001)
  self.assertGreater(east,9.9937+50/(111.2*math.cos(math.radians(53.5511)))-0.0001)
  for item in result:
   a,b,c,d=map(float,item.split(','))
   self.assertLessEqual(c-a,.6)
   self.assertLessEqual(d-b,.6)
 def test_100km_refused_as_bounded_first_release(self):
  with self.assertRaisesRegex(ValueError,'过大'):
   tiles(53.5511,9.9937,100)
 def test_logistics_aliases_match_german_companies(self):
  self.assertTrue(keyword_matches({'name':'Duisburg Logistik GmbH','category':''},'logistics'))
  self.assertTrue(keyword_matches({'name':'Rhein Spedition GmbH','category':'freight_forwarding_agency'},'logistics'))
  self.assertFalse(keyword_matches({'name':'Duisburg Cafe','category':'cafe'},'logistics'))
 def test_latest_release_is_parsed_from_cli(self):
  with patch('scripts.run_map_search_queue.subprocess.run',return_value=SimpleNamespace(stdout='Current release: 2026-10-21.0\\n')):
   self.assertEqual(current_release(),'2026-10-21.0')
 def test_worker_runs_quality_audit_after_ingest(self):
  from pathlib import Path
  source=Path('scripts/run_map_search_queue.py').read_text()
  self.assertLess(source.index('lead_map_worker_quality_audit',source.index('def process(')),
                  source.index('lead_map_worker_finish',source.index('def process(')))
if __name__=='__main__':unittest.main()
