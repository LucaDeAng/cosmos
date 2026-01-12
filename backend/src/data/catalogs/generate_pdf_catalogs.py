#!/usr/bin/env python3
"""
Generate synthetic PDF catalogs for ingestion testing
"""
import os
import sys

def generate_pdfs():
    try:
        from reportlab.lib.pagesizes import letter
        from reportlab.lib import colors
        from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
        from reportlab.lib.styles import getSampleStyleSheet
        from reportlab.lib.units import inch
    except ImportError:
        print("Installing reportlab...")
        os.system("pip install reportlab -q")
        from reportlab.lib.pagesizes import letter
        from reportlab.lib import colors
        from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
        from reportlab.lib.styles import getSampleStyleSheet
        from reportlab.lib.units import inch
    
    # Ensure pdf directory exists
    pdf_dir = os.path.dirname(os.path.abspath(__file__)) + "/pdf"
    os.makedirs(pdf_dir, exist_ok=True)
    
    styles = getSampleStyleSheet()
    
    # ============ PDF 1: Technology Products ============
    pdf_file1 = os.path.join(pdf_dir, "Tech_Products_Catalog_2026.pdf")
    doc = SimpleDocTemplate(pdf_file1, pagesize=letter)
    elements = []
    
    title = Paragraph("<b>Technology Products Catalog 2026</b>", styles['Title'])
    elements.append(title)
    elements.append(Spacer(1, 0.3*inch))
    
    data = [
        ['Product', 'Category', 'Price', 'Specs'],
        ['MacBook Pro 16"', 'Laptops', '$2,499', '32GB RAM, 1TB SSD'],
        ['iPad Pro 12.9"', 'Tablets', '$1,099', '12.9" Display, M2 Chip'],
        ['AirPods Pro', 'Audio', '$249', 'ANC, Spatial Audio'],
        ['Apple Watch Series 9', 'Wearables', '$399', 'Always-On Display'],
        ['iPhone 15 Pro Max', 'Smartphones', '$1,199', '6.7", A17 Pro, 256GB'],
        ['Mac Studio', 'Desktop', '$1,999', 'M2 Max, 32GB RAM'],
        ['iMac 24"', 'All-in-One', '$1,499', 'M3, 256GB SSD'],
    ]
    
    table = Table(data, colWidths=[2*inch, 1.5*inch, 1*inch, 2.5*inch])
    table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.grey),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 12),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
        ('GRID', (0, 0), (-1, -1), 1, colors.black),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.beige, colors.white]),
    ]))
    
    elements.append(table)
    doc.build(elements)
    print(f"✓ Created: {os.path.basename(pdf_file1)}")
    
    # ============ PDF 2: Cloud Services ============
    pdf_file2 = os.path.join(pdf_dir, "Cloud_Services_Pricing_2026.pdf")
    doc2 = SimpleDocTemplate(pdf_file2, pagesize=letter)
    elements2 = []
    
    title2 = Paragraph("<b>Cloud Services Pricing Guide 2026</b>", styles['Title'])
    elements2.append(title2)
    elements2.append(Spacer(1, 0.3*inch))
    
    data2 = [
        ['Service', 'Provider', 'Monthly Cost', 'Key Features'],
        ['EC2 Instance', 'AWS', '$10-50', 't3.medium, 4GB RAM, 20GB SSD'],
        ['Cloud SQL', 'GCP', '$15-100', 'PostgreSQL, 1TB Storage, HA'],
        ['App Service', 'Azure', '$13-99', 'Custom Domain, SSL, Auto-scale'],
        ['Cloud Run', 'GCP', 'Pay-as-you-go', 'Containers, Auto-scaling, 2M/month free'],
        ['RDS Database', 'AWS', '$15-200', 'Managed, Automated Backups, Multi-AZ'],
        ['Lambda Functions', 'AWS', 'Pay-as-you-go', '1M requests/month free'],
        ['Cloud Functions', 'GCP', 'Pay-as-you-go', 'Event-driven, Serverless'],
    ]
    
    table2 = Table(data2, colWidths=[1.8*inch, 1.2*inch, 1.5*inch, 2.5*inch])
    table2.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.steelblue),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 11),
        ('GRID', (0, 0), (-1, -1), 1, colors.black),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.lightblue, colors.white]),
    ]))
    
    elements2.append(table2)
    doc2.build(elements2)
    print(f"✓ Created: {os.path.basename(pdf_file2)}")
    
    # ============ PDF 3: Enterprise Software ============
    pdf_file3 = os.path.join(pdf_dir, "Enterprise_Software_Licenses.pdf")
    doc3 = SimpleDocTemplate(pdf_file3, pagesize=letter)
    elements3 = []
    
    title3 = Paragraph("<b>Enterprise Software License Catalog</b>", styles['Title'])
    elements3.append(title3)
    elements3.append(Spacer(1, 0.3*inch))
    
    data3 = [
        ['Software', 'License Type', 'Cost', 'User Limit'],
        ['Microsoft 365', 'Subscription', '$132/user/year', 'Unlimited'],
        ['Salesforce CRM', 'Subscription', '$1,980/user/year', 'Cloud-based'],
        ['Adobe Creative Cloud', 'Subscription', '$54.49/month', 'Single user'],
        ['Slack Workspace', 'Subscription', '$96/user/year', 'Unlimited members'],
        ['GitHub Enterprise', 'Subscription', '$231/user/year', 'Unlimited repos'],
        ['Jira Cloud', 'Subscription', '$90/user/year', 'Up to 10k issues'],
        ['Confluence Cloud', 'Subscription', '$55/month', 'Unlimited pages'],
        ['Okta IAM', 'Enterprise', 'Custom pricing', 'Enterprise users'],
    ]
    
    table3 = Table(data3, colWidths=[2*inch, 1.5*inch, 1.5*inch, 2.5*inch])
    table3.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.darkgreen),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 11),
        ('GRID', (0, 0), (-1, -1), 1, colors.black),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.lightgreen, colors.white]),
    ]))
    
    elements3.append(table3)
    doc3.build(elements3)
    print(f"✓ Created: {os.path.basename(pdf_file3)}")
    
    # ============ PDF 4: SaaS Analytics ============
    pdf_file4 = os.path.join(pdf_dir, "SaaS_Analytics_Products.pdf")
    doc4 = SimpleDocTemplate(pdf_file4, pagesize=letter)
    elements4 = []
    
    title4 = Paragraph("<b>SaaS Analytics & Monitoring 2026</b>", styles['Title'])
    elements4.append(title4)
    elements4.append(Spacer(1, 0.3*inch))
    
    data4 = [
        ['Product', 'Category', 'Pricing', 'Use Case'],
        ['Datadog', 'Monitoring', '$15/host/month', 'Infrastructure monitoring'],
        ['New Relic', 'APM', '$299-599/month', 'Application performance'],
        ['Segment', 'CDP', '$140/month+', 'Customer data platform'],
        ['Mixpanel', 'Analytics', '$999/month+', 'Product analytics'],
        ['Amplitude', 'Analytics', '$995/month+', 'User behavior analytics'],
        ['Looker', 'BI', 'Custom pricing', 'Business intelligence'],
        ['Tableau', 'Visualization', '$70/user/month', 'Data visualization'],
    ]
    
    table4 = Table(data4, colWidths=[1.8*inch, 1.5*inch, 1.5*inch, 2.7*inch])
    table4.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.purple),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 11),
        ('GRID', (0, 0), (-1, -1), 1, colors.black),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.lavender, colors.white]),
    ]))
    
    elements4.append(table4)
    doc4.build(elements4)
    print(f"✓ Created: {os.path.basename(pdf_file4)}")
    
    print(f"\n✓ All PDFs generated in: {pdf_dir}")
    print(f"✓ Total PDFs: 4 catalogs ready for ingestion testing")
    return True

if __name__ == "__main__":
    try:
        generate_pdfs()
    except Exception as e:
        print(f"✗ Error: {e}")
        sys.exit(1)
