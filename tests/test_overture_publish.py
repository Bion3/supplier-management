import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from scripts.publish_overture_candidates import send_file

TASK="11111111-2222-4333-8444-555555555555"
SECRET="example-unit-test-machine-token-1234567890"
class FakeResponse:
 def __init__(self, data):
  self.data = data
 def __enter__(self):return self
 def __exit__(self,*args):return None
 def read(self):return json.dumps(self.data).encode("utf8")

class PublishTests(unittest.TestCase):
 def test_chunking_and_final_flag(self):
  sent=[]
  def opener(req,timeout=35):
   body=json.loads(req.data.decode("utf8"))
   sent.append(body)
   return FakeResponse({"status":"completed" if body["p_final"] else "running",
                        "processed":len(body["p_rows"]),"inserted":len(body["p_rows"])})
  with tempfile.TemporaryDirectory() as d:
   file=Path(d)/"places.ndjson"
   file.write_text("\n".join(json.dumps({"id":f"11111111-2222-4333-8444-{i:012d}","name":"Example"})
                                 for i in range(101)))
   with patch("builtins.print"):
    send_file(file,TASK,"2026-09-23.1","9.75,53.40,10.33,53.72",
              "overture-test-batch-123",SECRET,opener)
  self.assertEqual([len(x["p_rows"]) for x in sent],[50,50,1])
  self.assertEqual([x["p_final"] for x in sent],[False,False,True])
  self.assertEqual({x["p_expected"] for x in sent},{101})
 def test_secret_required(self):
  with tempfile.TemporaryDirectory() as d:
   file=Path(d)/"x.ndjson";file.write_text("{}")
   with self.assertRaises(ValueError):
    send_file(file,TASK,"2026-09-23.1","9.75,53.40,10.33,53.72",
              "overture-test-batch-123","",lambda *_: None)

if __name__=="__main__":unittest.main()
