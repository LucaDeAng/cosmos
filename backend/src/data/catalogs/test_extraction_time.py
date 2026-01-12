#!/usr/bin/env python3
"""
Direct Extraction Time Measurement
Misura i tempi di estrazione senza dipendere dall'API
"""
import json
import time
import csv
from pathlib import Path

try:
    import pdfplumber
    HAS_PDFPLUMBER = True
except ImportError:
    HAS_PDFPLUMBER = False

def measure_json_extraction():
    """Misura il tempo di estrazione JSON"""
    print("\n" + "="*60)
    print("⏱ JSON EXTRACTION TIME MEASUREMENT")
    print("="*60)
    
    # Find all JSON catalogs
    json_files = list(Path(".").rglob("*.json"))
    # Filter for real catalogs (ones with "catalog" in the name)
    catalogs = [f for f in json_files if "catalog" in f.name.lower()][:3]
    
    results = []
    
    for catalog_path in catalogs:
        if not catalog_path.exists():
            print(f"\n⚠ {catalog_path.name} not found")
            continue
        
        print(f"\n📦 {catalog_path.name}")
        
        # Measure load time
        start = time.time()
        with open(catalog_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        load_time = time.time() - start
        
        # Measure extraction simulation
        start = time.time()
        products = data.get('products', [])
        product_count = len(products)
        
        # Simula l'estrazione: parsing di ogni prodotto
        for product in products:
            name = product.get('name', '')
            vendor = product.get('vendor', '')
            category = product.get('category', '')
        
        extraction_time = time.time() - start
        total_time = load_time + extraction_time
        throughput = product_count / extraction_time if extraction_time > 0 else 0
        
        print(f"  • Load time:      {load_time*1000:.1f}ms")
        print(f"  • Extraction:     {extraction_time*1000:.1f}ms")
        print(f"  • Total:          {total_time*1000:.1f}ms")
        print(f"  • Products:       {product_count}")
        print(f"  • Throughput:     {throughput:.0f} products/sec")
        
        results.append({
            'format': 'JSON',
            'file': catalog_path.name,
            'products': product_count,
            'load_ms': load_time*1000,
            'extraction_ms': extraction_time*1000,
            'total_ms': total_time*1000,
            'throughput': throughput
        })
    
    return results

def measure_csv_extraction():
    """Misura il tempo di estrazione CSV"""
    print("\n" + "="*60)
    print("⏱ CSV EXTRACTION TIME MEASUREMENT")
    print("="*60)
    
    catalogs = [
        "csv/electronics_products.csv",
        "csv/cloud_services.csv",
        "csv/saas_software.csv",
    ]
    
    results = []
    
    for catalog in catalogs:
        catalog_path = Path(catalog)
        
        if not catalog_path.exists():
            print(f"\n⚠ {catalog} not found")
            continue
        
        print(f"\n📦 {Path(catalog).name}")
        
        # Measure load time
        start = time.time()
        with open(catalog_path, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            rows = list(reader)
        load_time = time.time() - start
        
        # Measure extraction simulation
        start = time.time()
        product_count = 0
        for row in rows:
            product_count += 1
            # Simula l'estrazione dei campi
            name = row.get('Product Name') or row.get('Product') or row.get('Service', '')
            vendor = row.get('Vendor') or row.get('Provider', '')
        
        extraction_time = time.time() - start
        total_time = load_time + extraction_time
        throughput = product_count / extraction_time if extraction_time > 0 else 0
        
        print(f"  • Load time:      {load_time*1000:.1f}ms")
        print(f"  • Extraction:     {extraction_time*1000:.1f}ms")
        print(f"  • Total:          {total_time*1000:.1f}ms")
        print(f"  • Products:       {product_count}")
        print(f"  • Throughput:     {throughput:.0f} products/sec")
        
        results.append({
            'format': 'CSV',
            'file': Path(catalog).name,
            'products': product_count,
            'load_ms': load_time*1000,
            'extraction_ms': extraction_time*1000,
            'total_ms': total_time*1000,
            'throughput': throughput
        })
    
    return results

def measure_pdf_extraction():
    """Misura il tempo di estrazione PDF"""
    print("\n" + "="*60)
    print("⏱ PDF EXTRACTION TIME MEASUREMENT")
    print("="*60)
    
    if not HAS_PDFPLUMBER:
        print("\n⚠ pdfplumber not available, installing...")
        import subprocess
        subprocess.run(["pip", "install", "pdfplumber", "-q"], check=False)
    
    catalogs = [
        "pdf/Tech_Products_Catalog_2026.pdf",
        "pdf/Cloud_Services_Pricing_2026.pdf",
    ]
    
    results = []
    
    try:
        import pdfplumber
    except ImportError:
        print("\n✗ Could not install pdfplumber")
        return results
    
    for catalog in catalogs:
        catalog_path = Path(catalog)
        
        if not catalog_path.exists():
            print(f"\n⚠ {catalog} not found")
            continue
        
        print(f"\n📦 {Path(catalog).name}")
        
        # Measure load and extraction time
        start = time.time()
        
        try:
            with pdfplumber.open(catalog_path) as pdf:
                pages = len(pdf.pages)
                tables = []
                text = ""
                
                for page in pdf.pages:
                    text += page.extract_text() or ""
                    page_tables = page.extract_tables()
                    if page_tables:
                        tables.extend(page_tables)
                
                # Count extracted products
                product_count = 0
                for table in tables:
                    if len(table) > 1:
                        for row in table[1:]:
                            if len(row) > 0 and row[0]:
                                product_count += 1
        
        except Exception as e:
            print(f"  ✗ Error: {str(e)[:50]}")
            continue
        
        total_time = time.time() - start
        throughput = product_count / total_time if total_time > 0 else 0
        
        print(f"  • Total time:     {total_time*1000:.1f}ms")
        print(f"  • Pages:          {pages}")
        print(f"  • Tables:         {len(tables)}")
        print(f"  • Products:       {product_count}")
        print(f"  • Throughput:     {throughput:.0f} products/sec")
        
        results.append({
            'format': 'PDF',
            'file': Path(catalog).name,
            'products': product_count,
            'total_ms': total_time*1000,
            'throughput': throughput
        })
    
    return results

def print_report(json_results, csv_results, pdf_results):
    """Stampa il rapporto completo"""
    print("\n" + "="*60)
    print("📊 EXTRACTION TIME PERFORMANCE REPORT")
    print("="*60)
    
    all_results = json_results + csv_results + pdf_results
    
    if not all_results:
        print("\n⚠ No results to report")
        return
    
    # Summary table
    print("\n📈 PERFORMANCE BY FORMAT:")
    print(f"\n{'Format':<8} {'File':<35} {'Prod':<6} {'Time (ms)':<10} {'Speed':<12}")
    print("─" * 70)
    
    total_products = 0
    total_time = 0
    test_count = 0
    
    for result in all_results:
        fmt = result['format']
        file = result['file'][:34]
        products = result['products']
        total_ms = result['total_ms']
        throughput = result['throughput']
        
        print(f"{fmt:<8} {file:<35} {products:<6} {total_ms:<10.1f} {throughput:<12.0f}")
        
        total_products += products
        total_time += total_ms
        test_count += 1
    
    print("─" * 70)
    
    if test_count > 0:
        avg_time = total_time / test_count
        avg_throughput = total_products / (total_time / 1000) if total_time > 0 else 0
        
        print(f"\n⚡ AGGREGATE METRICS:")
        print(f"  Tests executed:      {test_count}")
        print(f"  Total products:      {total_products}")
        print(f"  Total time:          {total_time:.1f}ms ({total_time/1000:.2f}s)")
        print(f"  Avg time per file:   {avg_time:.1f}ms")
        print(f"  Overall throughput:  {avg_throughput:.0f} products/second")
        
        if total_products > 0:
            per_product_ms = (total_time / total_products)
            print(f"  Avg per product:     {per_product_ms:.2f}ms")
    
    print("\n" + "="*60)
    print("✅ EXTRACTION TIME MEASUREMENT COMPLETE")
    print("="*60 + "\n")

if __name__ == "__main__":
    print("\n" + "🚀 "*20)
    print("THEMIS EXTRACTION TIME ANALYSIS")
    print("🚀 "*20)
    
    json_res = measure_json_extraction()
    csv_res = measure_csv_extraction()
    pdf_res = measure_pdf_extraction()
    
    print_report(json_res, csv_res, pdf_res)
