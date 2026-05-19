# Wind Forecast Dashboard

A web application for visualizing and analyzing wind energy forecast accuracy in the UK.
> Claude Sonnet 4.6 was the LLM used to assist in development.

## Getting Started

To run the application locally, follow these steps:

1.  **Install dependencies:**
    ```bash
    npm install
    ```

2.  **Start the development server:**
    ```bash
    npm run dev
    ```

3.  **View the app:**
    Open [http://localhost:3000](http://localhost:3000) in your browser.

## Project Structure

The project follows a standard Next.js (App Router) architecture:

### Directories Present
-   `app/`: Core application logic, routing, and global styles.
-   `components/`: Reusable React components used throughout the dashboard.
-   `lib/`: Utility functions and data processing logic.
-   `public/`: Static assets such as images and icons.
-   `app/api/`: API routes for fetching data.

### Main Files
-   `app/page.tsx`: The main landing page of the application.
-   `components/WindForecastDashboard.tsx`: The primary dashboard component for wind forecast visualization.
-   `components/MetricsBar.tsx`: Component for displaying key performance metrics.
-   `lib/dataUtils.ts`: Logic for parsing and analyzing forecast data.
-   `forecast_error_analysis.ipynb`: Jupyter notebook containing the underlying data analysis and visualization generation.

## Deployment

The application is deployed on Vercel:
[https://forecast-app-gamma-taupe.vercel.app/](https://forecast-app-gamma-taupe.vercel.app/)

Link to demonstration video:
https://www.youtube.com/watch?v=D22WlaOCdWo
