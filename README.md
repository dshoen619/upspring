# Upspring - Ad Intelligence Platform

An ad intelligence platform that enables users to discover, analyze, and understand brand advertising strategies using data from Google Ads, powered by AI-driven insights.

## Live Demo

| Component | URL |
|-----------|-----|
| **Frontend** | https://main.ddmo2tcoaydzm.amplifyapp.com |
| **Backend API** | https://in5i4xtxin.us-east-2.awsapprunner.com |

## Features

- **Brand Ad Search** - Search for advertisements by brand name with autocomplete suggestions
- **AI-Powered Analysis** - Ask natural language questions about ad creatives, messaging, and strategies
- **Competitor Discovery** - AI-generated competitor suggestions with confidence ratings
- **Search History & Caching** - Persistent search history with 24-hour caching for fast retrieval
- **Multi-Platform Support** - Aggregates ads from Google and Meta ad libraries

## Architecture

### Production Infrastructure (AWS)

```
                              ┌─────────────────────┐
                              │       GitHub        │
                              │   (Source Code)     │
                              └──────────┬──────────┘
                                         │ Auto-deploy on push
                       ┌─────────────────┴─────────────────┐
                       ↓                                   ↓
         ┌─────────────────────────┐         ┌─────────────────────────┐
         │     AWS Amplify         │         │    AWS App Runner       │
         │  (Frontend Hosting)     │         │   (Backend Hosting)     │
         │                         │         │                         │
         │  - React SPA            │         │  - Express API          │
         │  - Auto SSL             │         │  - Auto-scaling         │
         │  - CDN distribution     │         │  - Managed containers   │
         │  - CI/CD pipeline       │         │  - CI/CD pipeline       │
         └───────────┬─────────────┘         └───────────┬─────────────┘
                     │                                   │
                     │ HTTPS (VITE_API_URL)              │
                     └──────────────┬────────────────────┘
                                    ↓
         ┌──────────────────────────┴──────────────────────────┐
         │                   AWS Services                       │
         │  ┌─────────────────────────────────────────────┐    │
         │  │              DynamoDB                        │    │
         │  │  - Search history & caching                  │    │
         │  │  - On-demand capacity                        │    │
         │  │  - 30-day TTL auto-cleanup                   │    │
         │  └─────────────────────────────────────────────┘    │
         │                                                      │
         │  ┌─────────────────────────────────────────────┐    │
         │  │           IAM Role                           │    │
         │  │  - App Runner instance role                  │    │
         │  │  - DynamoDB read/write permissions           │    │
         │  └─────────────────────────────────────────────┘    │
         └─────────────────────────────────────────────────────┘
                                    │
                                    ↓
         ┌──────────────────────────────────────────────────────┐
         │                External Services                      │
         │                                                       │
         │  ┌─────────────────┐       ┌─────────────────┐       │
         │  │     Apify       │       │    Groq LLM     │       │
         │  │                 │       │                 │       │
         │  │ - Google Ads    │       │ - Ad analysis   │       │
         │  │   Transparency  │       │ - Competitor    │       │
         │  │ - Meta Ad       │       │   suggestions   │       │
         │  │   Library       │       │ - llama-3.3-70b │       │
         │  └─────────────────┘       └─────────────────┘       │
         └──────────────────────────────────────────────────────┘
```

### Application Architecture

```
┌─────────────────────────────────────────────────────┐
│              FRONTEND (React + Vite)                │
│  SearchBar | AdsGrid | AIChat | CompetitorsSidebar  │
└────────────────────────┬────────────────────────────┘
                         │ REST API
                         ↓
┌─────────────────────────────────────────────────────┐
│            BACKEND (Express + TypeScript)           │
│  /api/ads | /api/ai | /api/brands | /api/history    │
└────────────┬─────────────────────────┬──────────────┘
             │                         │
             ↓                         ↓
┌────────────────────┐      ┌─────────────────────────┐
│  External Services │      │      Data Storage       │
│  - Apify (scraping)│      │  - DynamoDB (caching)   │
│  - Groq LLM (AI)   │      │  - Local JSON (brands)  │
└────────────────────┘      └─────────────────────────┘
```

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 19, TypeScript, Vite, Axios |
| Backend | Node.js, Express 5, TypeScript |
| AI | Groq LLM (llama-3.3-70b-versatile) |
| Data Scraping | Apify (Google Ads & Meta Ad Library actors) |
| Database | AWS DynamoDB (on-demand, TTL-enabled) |
| Frontend Hosting | AWS Amplify (CI/CD, CDN, SSL) |
| Backend Hosting | AWS App Runner (managed containers, auto-scaling) |
| Auth/Permissions | AWS IAM (instance roles for DynamoDB access) |
| Region | us-east-2 (Ohio) |

## Getting Started

### Prerequisites

- Node.js 18+
- npm
- AWS account (for DynamoDB)
- API keys for Apify and Groq

### Environment Variables

Create `server/.env`:

```env
PORT=3001
NODE_ENV=development
APIFY_API_KEY=your_apify_key
GROQ_API_KEY=your_groq_key
```

For the frontend in production, set `VITE_API_URL` to your backend URL.

### Installation

```bash
# Install server dependencies
cd server && npm install

# Install client dependencies
cd ../client && npm install
```

### Running Locally

```bash
# Terminal 1 - Start backend
cd server && npm run dev

# Terminal 2 - Start frontend
cd client && npm run dev
```

Frontend runs at `http://localhost:5173`, backend at `http://localhost:3001`.

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/ads/search` | GET | Fetch ads by brand name |
| `/api/ai/analyze` | POST | Analyze ads with AI |
| `/api/ai/competitors` | POST | Get competitor suggestions |
| `/api/brands` | GET | List available brands |
| `/api/search-history` | GET | Get recent searches |
| `/api/health` | GET | Health check |

---

## Design Decisions & Trade-offs

### 1. What assumptions did you make?

- **Users search for known brands**: The system assumes users will search for established brands that have active advertising campaigns. Searching for obscure or new brands may yield no results.

- **24-hour ad data freshness is acceptable**: Cached results are considered "fresh" for 24 hours. This assumes ad campaigns don't change so rapidly that stale data significantly impacts analysis quality.

- **English-language analysis**: The AI prompts and analysis are optimized for English

- **Single-user context**: The current implementation doesn't support multi-tenancy or user authentication. All searches and history are shared/global.


### 2. What are the biggest limitations of your current approach?

- **API dependency and costs**: Heavy reliance on Apify for scraping means costs scale linearly with usage. Rate limits and API availability directly impact functionality.

- **Limited ad platforms**: Only Google Ads are supported. Major platforms like Meta, TikTok, LinkedIn, and X (Twitter) are not included.

- **AI risk**: The LLM may generate plausible-sounding but incorrect insights, especially for brands it has limited training data on.

- **No image/video analysis**: The AI analyzes ad metadata and text but cannot actually "see" the creative content. Visual analysis would require computer vision integration.

- **DynamoDB cold starts**: Using on-demand DynamoDB capacity means occasional latency spikes on the first request after idle periods.

### 3. If this needed to support 100x more usage, what would you change first?

1. **Add a caching layer (Redis/ElastiCache)**: Put Redis in front of DynamoDB for hot data. Most brand searches follow a power-law distribution—a small number of popular brands account for most queries.

2. **Implement request queuing**: Use SQS or a job queue for Apify requests. This decouples the API response time from scraping latency and enables better rate limit management.

3. **Horizontal scaling with load balancing**: Move from single App Runner instance to an ECS cluster behind an ALB with auto-scaling based on request volume.

4. **API rate limiting and authentication**: Add per-user rate limits to prevent abuse and enable usage tracking. Implement API keys or OAuth for access control.

5. **Pre-warm popular brands**: Proactively refresh cache for the top 100-1000 most searched brands on a schedule rather than waiting for user requests.


### 4. How would you monitor this system in production?

**Logs:**
- Structured JSON logging with correlation IDs across requests
- Log levels: ERROR for failures, WARN for degraded states, INFO for key events
- Ship logs to CloudWatch Logs with retention policies
- Key events to log: API calls, cache hits/misses, external service calls, error stack traces

**Metrics:**
- Request latency 
- Error rate by endpoint and error type
- Cache hit ratio for DynamoDB lookups
- External API latency and error rates (Apify, Groq)
- Active searches per minute
- DynamoDB consumed capacity units


**Dashboards:**
- Real-time request volume and latency
- Cache performance metrics
- External service health status
- Cost tracking (Apify credits, DynamoDB RCUs/WCUs, Groq tokens)

### 5. What would you improve next if you had more time?

1. **Image/video analysis**: Integrate a vision model (GPT-4V, Claude Vision) to analyze actual ad creatives, not just metadata. This would dramatically improve insight quality.

2. **User authentication & personalization**: Add user accounts to enable personalized search history, saved brands, and custom alerts when competitors launch new campaigns.

3. **More ad platforms**: Add scrapers for Meta,TikTok Ads Library, LinkedIn Ads, and programmatic display networks for a more complete competitive picture.

4. **Trend analysis over time**: Store historical ad data to show how a brand's messaging evolves, seasonal patterns, and campaign frequency analysis.

5. **Export and reporting**: PDF/CSV export of ad data and AI insights.

6. **Cost optimization**: Implement smarter caching strategies, batch Apify requests, and use smaller/faster LLM models for simple queries to reduce per-request costs.

---


