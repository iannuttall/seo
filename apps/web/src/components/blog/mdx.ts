import CodeBlock from '@/components/CodeBlock.astro'
import AgentStep from './AgentStep.astro'
import BeforeAfter from './BeforeAfter.astro'
import BrowserFrame from './BrowserFrame.astro'
import Callout from './Callout.astro'
import CompareBars from './CompareBars.astro'
import Exhibit from './Exhibit.astro'
import Fix from './Fix.astro'
import KeywordTable from './KeywordTable.astro'
import PageGrid from './PageGrid.astro'
import PlanSteps from './PlanSteps.astro'
import RewriteExplorer from './RewriteExplorer.astro'
import SearchResult from './SearchResult.astro'
import SerpLadder from './SerpLadder.astro'
import SlopDemo from './SlopDemo.astro'
import TitleSheet from './TitleSheet.astro'
import TrafficCurve from './TrafficCurve.astro'
import TrafficMap from './TrafficMap.astro'
import UrlMap from './UrlMap.astro'
import VerticalBars from './VerticalBars.astro'

/** Components every blog post can use without importing them. */
export const blogMdxComponents = {
  AgentStep,
  BeforeAfter,
  BrowserFrame,
  Callout,
  CodeBlock,
  CompareBars,
  Exhibit,
  Fix,
  KeywordTable,
  PageGrid,
  PlanSteps,
  RewriteExplorer,
  SearchResult,
  SerpLadder,
  SlopDemo,
  TitleSheet,
  TrafficCurve,
  TrafficMap,
  UrlMap,
  VerticalBars,
}
