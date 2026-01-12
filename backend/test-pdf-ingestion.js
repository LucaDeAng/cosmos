// Test PDF ingestion with a real PDF from URL
const fetch = require('node-fetch');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

async function testPDFIngestion() {
  console.log('📥 Downloading test PDF...');
  
  // Download the PDF
  const pdfUrl = 'https://www.brescianinieco.it/pdf/CatalogoBRESCIANINI_ALL.pdf';
  
  try {
    const pdfResponse = await fetch(pdfUrl);
    if (!pdfResponse.ok) {
      throw new Error(`Failed to download PDF: ${pdfResponse.status}`);
    }
    
    const pdfBuffer = await pdfResponse.buffer();
    const tempPath = path.join(__dirname, 'test-catalog.pdf');
    fs.writeFileSync(tempPath, pdfBuffer);
    
    console.log(`✅ PDF downloaded: ${pdfBuffer.length} bytes`);
    
    // Now send to our API
    console.log('\n🚀 Sending PDF to ingestion API...');
    
    const formData = new FormData();
    formData.append('tenantId', 'test-tenant-pdf');
    formData.append('userContext', 'Questo è un catalogo prodotti industriali. Estrai i prodotti come items del portfolio IT.');
    formData.append('files', fs.createReadStream(tempPath), {
      filename: 'CatalogoBRESCIANINI_ALL.pdf',
      contentType: 'application/pdf'
    });
    
    const response = await fetch('http://localhost:3000/api/portfolio/ingest', {
      method: 'POST',
      body: formData,
    });
    
    console.log('📥 Response status:', response.status);
    const data = await response.json();
    
    console.log('\n📦 Response:');
    console.log(JSON.stringify(data, null, 2));
    
    // Cleanup
    fs.unlinkSync(tempPath);
    
    if (data.success && data.items?.length > 0) {
      console.log('\n✅ SUCCESS! Extracted items:');
      data.items.forEach((item, i) => {
        console.log(`  ${i + 1}. ${item.name} (${item.type}) - confidence: ${(item.confidence || 0).toFixed(2)}`);
      });
    } else {
      console.log('\n⚠️ No items extracted');
      if (data.parsing) {
        console.log('Parsing results:', data.parsing);
      }
      if (data.errors) {
        console.log('Errors:', data.errors);
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

testPDFIngestion();
