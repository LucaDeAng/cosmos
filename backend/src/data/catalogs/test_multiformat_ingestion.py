#!/usr/bin/env python3
"""
Multi-Format Ingestion Pipeline Test
Tests JSON, PDF, and CSV catalog ingestion with deduplication
"""
import os
import json
import csv
import sys
from pathlib import Path
from datetime import datetime

# Try to import PDF processing libraries
try:
    import pdfplumber
    HAS_PDFPLUMBER = True
except ImportError:
    HAS_PDFPLUMBER = False
    print("⚠ pdfplumber not installed, PDF extraction will be limited")

class CatalogIngestionTester:
    def __init__(self, catalogs_dir):
        self.catalogs_dir = catalogs_dir
        self.results = {
            'json': {'count': 0, 'products': [], 'errors': []},
            'csv': {'count': 0, 'products': [], 'errors': []},
            'pdf': {'count': 0, 'products': [], 'errors': []},
        }
        self.dedup_map = {}
        self.start_time = datetime.now()
    
    def test_json_catalogs(self):
        """Test JSON catalog ingestion"""
        print("\n" + "="*60)
        print("🔵 TESTING JSON CATALOGS")
        print("="*60)
        
        json_dir = Path(self.catalogs_dir)
        json_files = list(json_dir.rglob("*.json"))
        
        print(f"Found {len(json_files)} JSON files\n")
        
        for json_file in json_files[:10]:  # Test first 10 to keep it quick
            try:
                with open(json_file, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                
                catalog_name = data.get('catalog_name', json_file.name)
                products = data.get('products', [])
                product_count = len(products)
                
                self.results['json']['count'] += product_count
                
                for product in products:
                    product_id = product.get('id', product.get('name', 'unknown'))
                    self.results['json']['products'].append({
                        'id': product_id,
                        'name': product.get('name', 'N/A'),
                        'vendor': product.get('vendor', 'N/A'),
                        'source': str(json_file.name),
                        'format': 'JSON'
                    })
                    self._add_dedup(product_id, json_file.name)
                
                status = "✓" if product_count > 0 else "○"
                print(f"{status} {json_file.name}")
                print(f"   Catalog: {catalog_name}")
                print(f"   Products: {product_count}")
                
            except Exception as e:
                self.results['json']['errors'].append({
                    'file': str(json_file),
                    'error': str(e)
                })
                print(f"✗ {json_file.name}: {str(e)[:50]}")
        
        print(f"\n✓ JSON Ingestion: {self.results['json']['count']} products extracted")
    
    def test_csv_catalogs(self):
        """Test CSV catalog ingestion"""
        print("\n" + "="*60)
        print("🟢 TESTING CSV CATALOGS")
        print("="*60)
        
        csv_dir = Path(self.catalogs_dir) / "csv"
        if not csv_dir.exists():
            print("⚠ CSV directory not found")
            return
        
        csv_files = list(csv_dir.glob("*.csv"))
        print(f"Found {len(csv_files)} CSV files\n")
        
        for csv_file in csv_files:
            try:
                with open(csv_file, 'r', encoding='utf-8') as f:
                    reader = csv.DictReader(f)
                    rows = list(reader)
                
                product_count = len(rows)
                self.results['csv']['count'] += product_count
                
                for row in rows:
                    # CSV column names vary, try common ones
                    product_id = row.get('Product Name') or row.get('Product') or row.get('id', 'unknown')
                    name = product_id
                    vendor = row.get('Vendor') or row.get('Provider') or 'N/A'
                    
                    self.results['csv']['products'].append({
                        'id': product_id,
                        'name': name,
                        'vendor': vendor,
                        'source': str(csv_file.name),
                        'format': 'CSV'
                    })
                    self._add_dedup(product_id, csv_file.name)
                
                print(f"✓ {csv_file.name}")
                print(f"   Products: {product_count}")
                
            except Exception as e:
                self.results['csv']['errors'].append({
                    'file': str(csv_file),
                    'error': str(e)
                })
                print(f"✗ {csv_file.name}: {str(e)[:50]}")
        
        print(f"\n✓ CSV Ingestion: {self.results['csv']['count']} products extracted")
    
    def test_pdf_catalogs(self):
        """Test PDF catalog ingestion"""
        print("\n" + "="*60)
        print("🔴 TESTING PDF CATALOGS")
        print("="*60)
        
        pdf_dir = Path(self.catalogs_dir) / "pdf"
        if not pdf_dir.exists():
            print("⚠ PDF directory not found")
            return
        
        pdf_files = list(pdf_dir.glob("*.pdf"))
        print(f"Found {len(pdf_files)} PDF files\n")
        
        if not HAS_PDFPLUMBER:
            print("⚠ pdfplumber not available, installing...")
            os.system("pip install pdfplumber -q")
            try:
                import pdfplumber as pdf_lib
            except ImportError:
                print("✗ Could not import pdfplumber after installation")
                return
        else:
            import pdfplumber as pdf_lib
        
        for pdf_file in pdf_files:
            try:
                with pdf_lib.open(pdf_file) as pdf:
                    text = ""
                    tables = []
                    
                    for page in pdf.pages:
                        text += page.extract_text() or ""
                        page_tables = page.extract_tables()
                        if page_tables:
                            tables.extend(page_tables)
                    
                    # Extract product data from tables
                    product_count = 0
                    for table in tables:
                        if len(table) > 1:
                            headers = table[0]
                            for row in table[1:]:
                                if len(row) > 0 and row[0]:
                                    product_id = row[0].strip()
                                    vendor = row[1].strip() if len(row) > 1 else 'N/A'
                                    
                                    self.results['pdf']['products'].append({
                                        'id': product_id,
                                        'name': product_id,
                                        'vendor': vendor,
                                        'source': str(pdf_file.name),
                                        'format': 'PDF'
                                    })
                                    self._add_dedup(product_id, pdf_file.name)
                                    product_count += 1
                    
                    self.results['pdf']['count'] += product_count
                    
                    print(f"✓ {pdf_file.name}")
                    print(f"   Pages: {len(pdf.pages)}")
                    print(f"   Tables extracted: {len(tables)}")
                    print(f"   Products: {product_count}")
                
            except Exception as e:
                self.results['pdf']['errors'].append({
                    'file': str(pdf_file),
                    'error': str(e)
                })
                print(f"✗ {pdf_file.name}: {str(e)[:50]}")
        
        print(f"\n✓ PDF Ingestion: {self.results['pdf']['count']} products extracted")
    
    def _add_dedup(self, product_id, source):
        """Track deduplication across formats"""
        if product_id not in self.dedup_map:
            self.dedup_map[product_id] = []
        self.dedup_map[product_id].append(source)
    
    def test_deduplication(self):
        """Test deduplication across formats"""
        print("\n" + "="*60)
        print("🔄 TESTING DEDUPLICATION")
        print("="*60)
        
        duplicates = {k: v for k, v in self.dedup_map.items() if len(v) > 1}
        
        print(f"\nTotal unique products: {len(self.dedup_map)}")
        print(f"Duplicate products: {len(duplicates)}")
        
        if duplicates:
            print(f"\n📍 Sample duplicates across formats:")
            for i, (product_id, sources) in enumerate(list(duplicates.items())[:5]):
                print(f"  • {product_id}")
                for source in sources:
                    print(f"    - {source}")
                if i >= 4:
                    break
    
    def generate_report(self):
        """Generate comprehensive test report"""
        duration = (datetime.now() - self.start_time).total_seconds()
        
        print("\n" + "="*60)
        print("📊 INGESTION TEST REPORT")
        print("="*60)
        
        total_products = (self.results['json']['count'] + 
                         self.results['csv']['count'] + 
                         self.results['pdf']['count'])
        
        print(f"\n⏱ Test Duration: {duration:.2f} seconds")
        print(f"\n📈 EXTRACTION SUMMARY:")
        print(f"  JSON Products:  {self.results['json']['count']:6d} extracted")
        print(f"  CSV Products:   {self.results['csv']['count']:6d} extracted")
        print(f"  PDF Products:   {self.results['pdf']['count']:6d} extracted")
        print(f"  ─────────────────────────")
        print(f"  TOTAL:          {total_products:6d} products")
        
        print(f"\n✓ UNIQUE PRODUCTS (after dedup): {len(self.dedup_map)}")
        
        # Error summary
        total_errors = (len(self.results['json']['errors']) + 
                       len(self.results['csv']['errors']) + 
                       len(self.results['pdf']['errors']))
        
        if total_errors > 0:
            print(f"\n⚠ ERRORS: {total_errors}")
            if self.results['json']['errors']:
                print(f"  JSON errors: {len(self.results['json']['errors'])}")
            if self.results['csv']['errors']:
                print(f"  CSV errors: {len(self.results['csv']['errors'])}")
            if self.results['pdf']['errors']:
                print(f"  PDF errors: {len(self.results['pdf']['errors'])}")
        else:
            print(f"\n✓ NO ERRORS - All formats processed successfully!")
        
        # Success rate
        if total_products > 0:
            success_rate = (total_products / (total_products + total_errors)) * 100 if total_errors == 0 else 100
            print(f"\n✓ SUCCESS RATE: {success_rate:.1f}%")
        
        # Format distribution
        print(f"\n📊 FORMAT DISTRIBUTION:")
        if total_products > 0:
            print(f"  JSON: {(self.results['json']['count']/total_products*100):.1f}%")
            print(f"  CSV:  {(self.results['csv']['count']/total_products*100):.1f}%")
            print(f"  PDF:  {(self.results['pdf']['count']/total_products*100):.1f}%")
        
        # Deduplication effectiveness
        dedup_ratio = (1 - len(self.dedup_map)/total_products) if total_products > 0 else 0
        print(f"\n🔄 DEDUPLICATION:")
        print(f"  Duplicate rate: {dedup_ratio*100:.1f}%")
        print(f"  Unique items: {len(self.dedup_map)}/{total_products}")
        
        print("\n" + "="*60)
        print("✅ MULTI-FORMAT INGESTION TEST COMPLETE")
        print("="*60 + "\n")
    
    def run(self):
        """Run all tests"""
        print("\n" + "🚀 "*20)
        print("THEMIS MULTI-FORMAT CATALOG INGESTION TEST")
        print("🚀 "*20)
        
        self.test_json_catalogs()
        self.test_csv_catalogs()
        self.test_pdf_catalogs()
        self.test_deduplication()
        self.generate_report()

if __name__ == "__main__":
    catalogs_dir = "c:\\Users\\l.de.angelis\\Setup\\backend\\src\\data\\catalogs"
    
    if not os.path.exists(catalogs_dir):
        print(f"✗ Catalogs directory not found: {catalogs_dir}")
        sys.exit(1)
    
    tester = CatalogIngestionTester(catalogs_dir)
    tester.run()
