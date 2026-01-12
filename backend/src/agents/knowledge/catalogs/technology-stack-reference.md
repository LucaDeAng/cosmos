# Technology Stack Reference - Stack Tecnologici di Riferimento

## Metadata
- type: catalog
- category: catalog_technologies
- version: 1.0
- language: it/en

---

## 1. Cloud Platforms

### 1.1 Amazon Web Services (AWS)
**Keywords**: AWS, Amazon, EC2, S3, Lambda, RDS, EKS, CloudFormation
**Category**: Infrastructure Services → Compute/Storage
**Typical Use Cases**:
- Cloud-native applications
- Big data & analytics
- Machine learning workloads
- Serverless architectures

### 1.2 Microsoft Azure
**Keywords**: Azure, Microsoft Cloud, AKS, Azure Functions, Cosmos DB, Azure DevOps
**Category**: Infrastructure Services → Compute/Storage
**Typical Use Cases**:
- Enterprise hybrid cloud
- Microsoft ecosystem integration
- .NET applications
- AI/Cognitive services

### 1.3 Google Cloud Platform (GCP)
**Keywords**: GCP, Google Cloud, BigQuery, GKE, Cloud Run, Vertex AI
**Category**: Infrastructure Services → Compute/Storage
**Typical Use Cases**:
- Data analytics & ML
- Kubernetes-native workloads
- Real-time analytics
- AI/ML platforms

---

## 2. Enterprise Applications

### 2.1 SAP
**Keywords**: SAP, S/4HANA, ECC, SAP BW, SAP Fiori, ABAP, SAP HANA
**Category**: Application Services → Enterprise Applications → ERP
**Modules**: FI, CO, MM, SD, PP, HR, PS, PM, QM
**Typical Use Cases**:
- Financial management
- Supply chain
- Manufacturing
- Human resources

### 2.2 Salesforce
**Keywords**: Salesforce, SFDC, Sales Cloud, Service Cloud, Marketing Cloud, Apex, Lightning
**Category**: Application Services → Enterprise Applications → CRM
**Typical Use Cases**:
- Sales automation
- Customer service
- Marketing automation
- Partner management

### 2.3 Microsoft Dynamics 365
**Keywords**: Dynamics, D365, Business Central, Finance & Operations, CE
**Category**: Application Services → Enterprise Applications → ERP/CRM
**Typical Use Cases**:
- Mid-market ERP
- CRM for Microsoft shops
- Finance & operations
- Field service

### 2.4 ServiceNow
**Keywords**: ServiceNow, SNOW, ITSM, ITOM, ITBM, CSM
**Category**: Managed Services → ITSM
**Typical Use Cases**:
- IT service management
- HR service delivery
- Customer service
- IT operations management

---

## 3. Development Platforms

### 3.1 Containerization
**Keywords**: Docker, container, containerizzazione, immagine
**Category**: Platform Services → DevOps
**Related**: Kubernetes, Podman, containerd

### 3.2 Kubernetes
**Keywords**: Kubernetes, K8s, cluster, pod, helm, kubectl
**Category**: Platform Services → DevOps
**Distributions**: EKS, AKS, GKE, OpenShift, Rancher

### 3.3 GitHub / GitLab
**Keywords**: GitHub, GitLab, Git, repository, pull request, merge, CI/CD
**Category**: Platform Services → DevOps → Source Control
**Features**: Version control, CI/CD, Issue tracking, Code review

---

## 4. Data & Analytics

### 4.1 Databases - Relational
| Technology | Keywords | Use Case |
|------------|----------|----------|
| PostgreSQL | Postgres, PG, pgAdmin | Open source OLTP |
| MySQL | MySQL, MariaDB | Web applications |
| Oracle | Oracle DB, ORA, PL/SQL | Enterprise OLTP |
| SQL Server | MSSQL, T-SQL | Microsoft ecosystem |

### 4.2 Databases - NoSQL
| Technology | Keywords | Use Case |
|------------|----------|----------|
| MongoDB | Mongo, document DB | Document storage |
| Redis | Redis, cache | Caching, sessions |
| Elasticsearch | ES, Elastic, ELK | Search, logs |
| DynamoDB | DynamoDB, Dynamo | Serverless NoSQL |
| Cassandra | Cassandra, CQL | Time-series, IoT |

### 4.3 Data Warehousing
| Technology | Keywords | Use Case |
|------------|----------|----------|
| Snowflake | Snowflake, SF | Cloud DWH |
| Databricks | Databricks, Delta Lake | Lakehouse |
| BigQuery | BQ, BigQuery | Google analytics |
| Redshift | Redshift | AWS analytics |
| Synapse | Azure Synapse | Microsoft analytics |

### 4.4 BI Tools
| Technology | Keywords | Use Case |
|------------|----------|----------|
| Power BI | PowerBI, PBI, DAX | Microsoft BI |
| Tableau | Tableau, vizualization | Enterprise BI |
| Looker | Looker, LookML | Google BI |
| Qlik | Qlik, QlikView, Qlik Sense | Associative BI |

---

## 5. Integration & Middleware

### 5.1 API Management
| Technology | Keywords |
|------------|----------|
| Kong | Kong, API Gateway |
| Apigee | Apigee, Google API |
| AWS API Gateway | API Gateway, Lambda |
| Azure API Management | APIM, Azure API |
| MuleSoft | MuleSoft, Anypoint |

### 5.2 Message Queues
| Technology | Keywords | Pattern |
|------------|----------|---------|
| Apache Kafka | Kafka, topic, consumer | Event streaming |
| RabbitMQ | RabbitMQ, AMQP | Message queue |
| AWS SQS | SQS, queue | Serverless queue |
| Azure Service Bus | Service Bus, ASB | Enterprise messaging |

### 5.3 Integration Platforms
| Technology | Keywords |
|------------|----------|
| MuleSoft | MuleSoft, Anypoint, API-led |
| Dell Boomi | Boomi, iPaaS |
| Workato | Workato, recipe |
| Talend | Talend, ETL, data integration |
| Informatica | Informatica, PowerCenter |

---

## 6. Security Technologies

### 6.1 Identity & Access Management
| Technology | Keywords |
|------------|----------|
| Okta | Okta, SSO, SAML |
| Azure AD | AAD, Azure Active Directory, Entra |
| Ping Identity | Ping, PingFederate |
| Auth0 | Auth0, JWT |
| CyberArk | CyberArk, PAM, privileged access |

### 6.2 Network Security
| Technology | Keywords |
|------------|----------|
| Palo Alto | Palo Alto, PAN, NGFW |
| Fortinet | Fortinet, FortiGate |
| Cisco | Cisco ASA, Firepower |
| Zscaler | Zscaler, ZIA, ZPA |
| Cloudflare | Cloudflare, WAF, DDoS |

### 6.3 Security Operations
| Technology | Keywords |
|------------|----------|
| Splunk | Splunk, SIEM |
| Microsoft Sentinel | Sentinel, Azure SIEM |
| CrowdStrike | CrowdStrike, Falcon, EDR |
| Qualys | Qualys, vulnerability |
| Tenable | Tenable, Nessus |

---

## 7. AI & Machine Learning

### 7.1 ML Platforms
| Technology | Keywords |
|------------|----------|
| AWS SageMaker | SageMaker, ML, training |
| Azure ML | Azure Machine Learning, AzureML |
| Google Vertex AI | Vertex, AutoML |
| Databricks ML | MLflow, Feature Store |
| DataRobot | DataRobot, AutoML |

### 7.2 AI Services
| Technology | Keywords |
|------------|----------|
| OpenAI | OpenAI, GPT, ChatGPT, API |
| Azure Cognitive Services | Cognitive, Azure AI |
| AWS Bedrock | Bedrock, Claude, Anthropic |
| Google Cloud AI | PaLM, Gemini, Bard |
| Hugging Face | HuggingFace, transformers |

### 7.3 LLM/GenAI
| Technology | Keywords |
|------------|----------|
| OpenAI GPT | GPT-4, GPT-3.5, ChatGPT |
| Anthropic Claude | Claude, Anthropic |
| Google Gemini | Gemini, Bard |
| Meta LLaMA | LLaMA, Llama 2 |
| Mistral | Mistral, Mixtral |

---

## 8. Automation & RPA

### 8.1 RPA Platforms
| Technology | Keywords |
|------------|----------|
| UiPath | UiPath, robot, automazione |
| Automation Anywhere | AA, A360 |
| Blue Prism | Blue Prism, digital worker |
| Power Automate | Power Automate, Flow |
| WorkFusion | WorkFusion, intelligent automation |

### 8.2 Process Mining
| Technology | Keywords |
|------------|----------|
| Celonis | Celonis, process mining |
| ProcessGold | ProcessGold, UiPath Process Mining |
| ABBYY Timeline | ABBYY, task mining |
| Minit | Minit, process intelligence |

---

## 9. Monitoring & Observability

### 9.1 APM & Monitoring
| Technology | Keywords |
|------------|----------|
| Datadog | Datadog, DD, observability |
| New Relic | New Relic, APM |
| Dynatrace | Dynatrace, DT |
| AppDynamics | AppDynamics, Cisco AppD |
| Prometheus | Prometheus, PromQL, Grafana |

### 9.2 Logging
| Technology | Keywords |
|------------|----------|
| ELK Stack | Elasticsearch, Logstash, Kibana |
| Splunk | Splunk, SPL |
| Datadog Logs | DD Logs |
| Sumo Logic | Sumo Logic |
| Graylog | Graylog |

---

## 10. Technology → Portfolio Type Mapping

| Technology Category | Typical Portfolio Type | Reasoning |
|---------------------|------------------------|-----------|
| Cloud migration | Initiative | Time-bound project |
| ERP implementation | Initiative | Major transformation |
| SaaS platform | Service | Ongoing subscription |
| Custom application | Product | Internal asset |
| Managed services | Service | Outsourced capability |
| BI/Analytics tool | Product | Internal capability |
| Security service | Service | Continuous protection |
| RPA implementation | Initiative → Product | Project then asset |
| DevOps platform | Product | Internal tooling |
| API platform | Product | Reusable capability |

---

## 11. Maturity Assessment by Technology

### Cloud Maturity
| Level | Indicators |
|-------|------------|
| 1 - Initial | No cloud, all on-premise |
| 2 - Developing | Lift & shift, IaaS only |
| 3 - Defined | PaaS adoption, cloud-native apps |
| 4 - Managed | Multi-cloud, FinOps, automation |
| 5 - Optimizing | Serverless, edge, cloud-first |

### DevOps Maturity
| Level | Indicators |
|-------|------------|
| 1 - Initial | Manual deployments, no CI |
| 2 - Developing | Basic CI, some automation |
| 3 - Defined | CI/CD pipelines, IaC |
| 4 - Managed | GitOps, automated testing |
| 5 - Optimizing | Full automation, DevSecOps |

### Data Maturity
| Level | Indicators |
|-------|------------|
| 1 - Initial | Spreadsheets, silos |
| 2 - Developing | Basic DWH, some reporting |
| 3 - Defined | BI platform, data governance |
| 4 - Managed | Self-service BI, data catalog |
| 5 - Optimizing | ML/AI, real-time analytics |
