/**
 * Analytics Module
 *
 * Provides comprehensive trade analytics, performance metrics, pattern detection,
 * risk analysis, and backtesting capabilities for Polymarket copy trading.
 */

// Trader Performance
export {
    calculateTraderMetrics,
    getMarketPerformance,
    compareTraders,
    TraderMetrics,
    MarketPerformance,
} from './traderPerformance';

// Pattern Detection
export {
    analyzeTimePatterns,
    analyzeVolumeCorrelations,
    analyzeTradingBehavior,
    detectMomentumPatterns,
    TimePattern,
    VolumeCorrelation,
    TradingBehavior,
} from './patternDetection';

// Risk Metrics
export {
    calculateRiskMetrics,
    calculateConcentrationMetrics,
    calculateRollingRisk,
    RiskMetrics,
    ConcentrationMetrics,
} from './riskMetrics';

// Backtesting
export {
    runBacktest,
    runParameterSweep,
    compareTraderBacktests,
    generateBacktestReport,
    CopyStrategyParams,
    BacktestTrade,
    BacktestResults,
} from './backtesting';
