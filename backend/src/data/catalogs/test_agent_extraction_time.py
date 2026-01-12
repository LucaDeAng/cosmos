#!/usr/bin/env python3
"""
Test Ingestion Accelerator Agent Extraction Time
Measures end-to-end performance of catalog ingestion via the API
"""
import requests
import json
import time
import sys
from pathlib import Path

class AgentExtractionTester:
    def __init__(self, api_url="http://localhost:3001"):
        self.api_url = api_url
        self.results = {
            'json': [],
            'csv': [],
            'pdf': [],
        }
        self.session = requests.Session()
    
    def check_api_health(self):
        """Check if backend is running"""
        print("\n" + "="*60)
        print("🔍 CHECKING BACKEND HEALTH")
        print("="*60)
        
        try:
            response = self.session.get(f"{self.api_url}/health", timeout=5)
            if response.status_code == 200:
                print(f"✓ Backend is running on {self.api_url}")
                return True
            else:
                print(f"✗ Backend health check failed: {response.status_code}")
                return False
        except Exception as e:
            print(f"✗ Cannot connect to backend: {str(e)}")
            print(f"  Make sure backend is running on {self.api_url}")
            return False
    
    def test_json_extraction(self):
        """Test JSON catalog extraction time"""
        print("\n" + "="*60)
        print("⏱ TESTING JSON EXTRACTION TIME")
        print("="*60)
        
        json_catalogs = [
            "c:\\Users\\l.de.angelis\\Setup\\backend\\src\\data\\catalogs\\python_packages_catalog.json",
            "c:\\Users\\l.de.angelis\\Setup\\backend\\src\\data\\catalogs\\npm_packages_catalog.json",
            "c:\\Users\\l.de.angelis\\Setup\\backend\\src\\data\\catalogs\\cloud_services_catalog.json",
        ]
        
        for catalog_path in json_catalogs:
            if not Path(catalog_path).exists():
                print(f"⚠ {Path(catalog_path).name} not found")
                continue
            
            try:
                with open(catalog_path, 'r', encoding='utf-8') as f:
                    catalog_data = json.load(f)
                
                print(f"\n📦 Testing: {Path(catalog_path).name}")
                
                # Measure extraction time
                start_time = time.time()
                
                try:
                    response = self.session.post(
                        f"{self.api_url}/api/ingestion/extract",
                        json={
                            'catalog': catalog_data,
                            'format': 'json',
                            'source': Path(catalog_path).name
                        },
                        timeout=30
                    )
                    
                    elapsed = time.time() - start_time
                    
                    if response.status_code in [200, 201]:
                        result = response.json()
                        products_count = result.get('extracted_count', len(catalog_data.get('products', [])))
                        
                        print(f"  ✓ Extraction time: {elapsed:.3f}s")
                        print(f"    Products extracted: {products_count}")
                        print(f"    Throughput: {products_count/elapsed:.0f} products/sec")
                        
                        self.results['json'].append({
                            'file': Path(catalog_path).name,
                            'products': products_count,
                            'time': elapsed,
                            'throughput': products_count/elapsed
                        })
                    else:
                        print(f"  ✗ API Error: {response.status_code}")
                        print(f"    Response: {response.text[:100]}")
                
                except requests.exceptions.Timeout:
                    print(f"  ✗ Request timeout (>30s)")
                except requests.exceptions.ConnectionError as e:
                    print(f"  ✗ Connection error: {str(e)[:50]}")
            
            except Exception as e:
                print(f"  ✗ Error: {str(e)[:50]}")
    
    def test_csv_extraction(self):
        """Test CSV catalog extraction time"""
        print("\n" + "="*60)
        print("⏱ TESTING CSV EXTRACTION TIME")
        print("="*60)
        
        csv_catalogs = [
            "c:\\Users\\l.de.angelis\\Setup\\backend\\src\\data\\catalogs\\csv\\electronics_products.csv",
            "c:\\Users\\l.de.angelis\\Setup\\backend\\src\\data\\catalogs\\csv\\cloud_services.csv",
            "c:\\Users\\l.de.angelis\\Setup\\backend\\src\\data\\catalogs\\csv\\saas_software.csv",
        ]
        
        for catalog_path in csv_catalogs:
            if not Path(catalog_path).exists():
                print(f"⚠ {Path(catalog_path).name} not found")
                continue
            
            try:
                with open(catalog_path, 'r', encoding='utf-8') as f:
                    csv_content = f.read()
                
                print(f"\n📦 Testing: {Path(catalog_path).name}")
                
                # Measure extraction time
                start_time = time.time()
                
                try:
                    response = self.session.post(
                        f"{self.api_url}/api/ingestion/extract",
                        json={
                            'content': csv_content,
                            'format': 'csv',
                            'source': Path(catalog_path).name
                        },
                        timeout=30
                    )
                    
                    elapsed = time.time() - start_time
                    
                    if response.status_code in [200, 201]:
                        result = response.json()
                        products_count = result.get('extracted_count', csv_content.count('\n'))
                        
                        print(f"  ✓ Extraction time: {elapsed:.3f}s")
                        print(f"    Products extracted: {products_count}")
                        print(f"    Throughput: {products_count/elapsed:.0f} products/sec")
                        
                        self.results['csv'].append({
                            'file': Path(catalog_path).name,
                            'products': products_count,
                            'time': elapsed,
                            'throughput': products_count/elapsed if elapsed > 0 else 0
                        })
                    else:
                        print(f"  ✗ API Error: {response.status_code}")
                
                except requests.exceptions.Timeout:
                    print(f"  ✗ Request timeout (>30s)")
                except requests.exceptions.ConnectionError:
                    print(f"  ✗ Connection error")
            
            except Exception as e:
                print(f"  ✗ Error: {str(e)[:50]}")
    
    def test_pdf_extraction(self):
        """Test PDF catalog extraction time"""
        print("\n" + "="*60)
        print("⏱ TESTING PDF EXTRACTION TIME")
        print("="*60)
        
        pdf_catalogs = [
            "c:\\Users\\l.de.angelis\\Setup\\backend\\src\\data\\catalogs\\pdf\\Tech_Products_Catalog_2026.pdf",
            "c:\\Users\\l.de.angelis\\Setup\\backend\\src\\data\\catalogs\\pdf\\Cloud_Services_Pricing_2026.pdf",
        ]
        
        for catalog_path in pdf_catalogs:
            if not Path(catalog_path).exists():
                print(f"⚠ {Path(catalog_path).name} not found")
                continue
            
            try:
                with open(catalog_path, 'rb') as f:
                    pdf_content = f.read()
                
                print(f"\n📦 Testing: {Path(catalog_path).name}")
                
                # Measure extraction time
                start_time = time.time()
                
                try:
                    files = {'file': (Path(catalog_path).name, pdf_content, 'application/pdf')}
                    response = self.session.post(
                        f"{self.api_url}/api/ingestion/extract-pdf",
                        files=files,
                        timeout=30
                    )
                    
                    elapsed = time.time() - start_time
                    
                    if response.status_code in [200, 201]:
                        result = response.json()
                        products_count = result.get('extracted_count', 0)
                        
                        print(f"  ✓ Extraction time: {elapsed:.3f}s")
                        print(f"    Products extracted: {products_count}")
                        if products_count > 0:
                            print(f"    Throughput: {products_count/elapsed:.0f} products/sec")
                        
                        self.results['pdf'].append({
                            'file': Path(catalog_path).name,
                            'products': products_count,
                            'time': elapsed,
                            'throughput': products_count/elapsed if elapsed > 0 else 0
                        })
                    else:
                        print(f"  ✗ API Error: {response.status_code}")
                
                except requests.exceptions.Timeout:
                    print(f"  ✗ Request timeout (>30s)")
                except requests.exceptions.ConnectionError:
                    print(f"  ✗ Connection error")
            
            except Exception as e:
                print(f"  ✗ Error: {str(e)[:50]}")
    
    def generate_report(self):
        """Generate performance report"""
        print("\n" + "="*60)
        print("📊 AGENT EXTRACTION PERFORMANCE REPORT")
        print("="*60)
        
        total_products = 0
        total_time = 0
        test_count = 0
        
        print("\n📈 JSON EXTRACTIONS:")
        if self.results['json']:
            for test in self.results['json']:
                print(f"  • {test['file']}")
                print(f"    Time: {test['time']:.3f}s | Products: {test['products']} | Speed: {test['throughput']:.0f}/sec")
                total_products += test['products']
                total_time += test['time']
                test_count += 1
        else:
            print("  (No results)")
        
        print("\n📈 CSV EXTRACTIONS:")
        if self.results['csv']:
            for test in self.results['csv']:
                print(f"  • {test['file']}")
                print(f"    Time: {test['time']:.3f}s | Products: {test['products']} | Speed: {test['throughput']:.0f}/sec")
                total_products += test['products']
                total_time += test['time']
                test_count += 1
        else:
            print("  (No results)")
        
        print("\n📈 PDF EXTRACTIONS:")
        if self.results['pdf']:
            for test in self.results['pdf']:
                print(f"  • {test['file']}")
                print(f"    Time: {test['time']:.3f}s | Products: {test['products']} | Speed: {test['throughput']:.0f}/sec")
                total_products += test['products']
                total_time += test['time']
                test_count += 1
        else:
            print("  (No results)")
        
        if test_count > 0:
            print("\n" + "─"*60)
            print("⚡ AGGREGATE PERFORMANCE:")
            print(f"  Total tests: {test_count}")
            print(f"  Total products extracted: {total_products}")
            print(f"  Total time: {total_time:.3f}s")
            print(f"  Average extraction time: {total_time/test_count:.3f}s per catalog")
            print(f"  Average throughput: {total_products/total_time:.0f} products/second (Agent)")
            
            if total_time > 0:
                avg_product_time = (total_time / total_products) * 1000  # milliseconds
                print(f"  Avg time per product: {avg_product_time:.1f}ms")
        
        print("\n" + "="*60)
    
    def run(self):
        """Run all tests"""
        print("\n" + "🚀 "*20)
        print("THEMIS INGESTION ACCELERATOR - AGENT EXTRACTION TIME TEST")
        print("🚀 "*20)
        
        if not self.check_api_health():
            print("\n⚠ Backend is not running. Start it with: .\\START-BACKEND.ps1")
            return False
        
        self.test_json_extraction()
        self.test_csv_extraction()
        self.test_pdf_extraction()
        self.generate_report()
        
        return True

if __name__ == "__main__":
    tester = AgentExtractionTester()
    success = tester.run()
    sys.exit(0 if success else 1)
