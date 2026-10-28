import math
import unittest
from scripts.run_map_search_queue import tiles, keyword_matches
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
if __name__=='__main__':unittest.main()
