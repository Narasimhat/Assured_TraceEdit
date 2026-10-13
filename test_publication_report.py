import copy
import tempfile
import unittest
from pathlib import Path
from publication_report import validate_publication, export_report

def fixture():
    return {'version':'publication/1','title':'<script>test</script>','rows':[{'sample':'=unsafe','control':'WT','workflow':'knockout','action':'Resequence','selected':False,'reasons':['Failed anchor'],'warnings':[],'scores':{'aq':{'indel':None,'ko':None},'te':{'indel':None,'ko':None}},'target':None,'markers':[],'sizes':[],'source':{},'error':'Failed anchor'}]}

class PublicationTests(unittest.TestCase):
    def test_validation(self):
        for value in (None,{},dict(fixture(),rows=[]),dict(fixture(),format='exe')):
            with self.assertRaises(ValueError): validate_publication(value)
        b=fixture();b['rows'][0]['scores']['te']['ko']=float('nan')
        with self.assertRaises(ValueError):validate_publication(b)
        b['rows'][0]['scores']['te']['ko']=2
        with self.assertRaises(ValueError):validate_publication(b)
    def test_failed_row_exports_pdf_and_safe_csv_without_invented_score(self):
        b=fixture();before=copy.deepcopy(b)
        with tempfile.TemporaryDirectory() as tmp:
            path=export_report(b,Path(tmp))
            self.assertTrue(path.read_bytes().startswith(b'%PDF'))
            csv=(Path(tmp)/'results.csv').read_text(encoding='utf-8-sig')
            self.assertIn("'=unsafe",csv);self.assertIn('Not available',csv)
        self.assertEqual(b,before)
if __name__=='__main__':unittest.main()
