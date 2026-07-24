import type {
  ProviderMarketSupport,
  ProviderWarning,
  SearchMarket,
} from '../contracts.js'
import { searchMarketSchema } from '../contracts.js'
import { ProviderError } from '../errors.js'

export const SEMRUSH_V3_COUNTRY_CODES = [
  'AE',
  'AF',
  'AL',
  'AM',
  'AO',
  'AR',
  'AT',
  'AU',
  'AZ',
  'BA',
  'BD',
  'BE',
  'BG',
  'BH',
  'BO',
  'BR',
  'BS',
  'BN',
  'BW',
  'BY',
  'BZ',
  'CA',
  'CD',
  'CH',
  'CL',
  'CM',
  'CO',
  'CR',
  'CV',
  'CY',
  'CZ',
  'DE',
  'DK',
  'DO',
  'DZ',
  'EC',
  'EE',
  'EG',
  'ES',
  'ET',
  'FI',
  'FR',
  'GB',
  'GE',
  'GH',
  'GR',
  'GT',
  'GY',
  'HK',
  'HN',
  'HR',
  'HT',
  'HU',
  'ID',
  'IE',
  'IL',
  'IN',
  'IS',
  'IT',
  'JM',
  'JO',
  'JP',
  'KH',
  'KR',
  'KW',
  'KZ',
  'LB',
  'LK',
  'LT',
  'LU',
  'LV',
  'LY',
  'MA',
  'MD',
  'ME',
  'MG',
  'MN',
  'MT',
  'MU',
  'MX',
  'MY',
  'MZ',
  'NA',
  'NG',
  'NI',
  'NL',
  'NO',
  'NP',
  'NZ',
  'OM',
  'PA',
  'PE',
  'PH',
  'PK',
  'PL',
  'PT',
  'PY',
  'QA',
  'RO',
  'RS',
  'RU',
  'SA',
  'SE',
  'SG',
  'SI',
  'SK',
  'SN',
  'SV',
  'TH',
  'TN',
  'TR',
  'TT',
  'TW',
  'UA',
  'US',
  'UY',
  'VE',
  'VN',
  'ZA',
  'ZM',
  'ZW',
] as const

const SUPPORTED_COUNTRIES = new Set<string>(SEMRUSH_V3_COUNTRY_CODES)

export const SEMRUSH_V3_MARKETS = [
  {
    searchEngines: ['google'],
    countryCodes: SEMRUSH_V3_COUNTRY_CODES,
    devices: ['desktop'],
    location: 'country-only',
  },
] as const satisfies readonly ProviderMarketSupport[]

export function semrushMarket(
  input: SearchMarket,
  operation: string,
): { market: SearchMarket; database: string } {
  const parsed = searchMarketSchema.safeParse(input)
  if (!parsed.success) {
    throw new ProviderError({
      provider: 'semrush',
      operation,
      code: 'configuration',
      message: 'Semrush requires a valid search market.',
    })
  }
  const market = parsed.data
  if (
    market.searchEngine !== 'google' ||
    market.location ||
    market.device === 'mobile' ||
    !SUPPORTED_COUNTRIES.has(market.countryCode)
  ) {
    throw new ProviderError({
      provider: 'semrush',
      operation,
      code: 'configuration',
      message:
        'Semrush V3 research supports Google desktop data in its country-level regional databases.',
    })
  }
  return {
    market,
    database:
      market.countryCode === 'GB' ? 'uk' : market.countryCode.toLowerCase(),
  }
}

export function semrushMarketWarnings(market: SearchMarket): ProviderWarning[] {
  return [
    {
      code: 'provider-database-not-language-filtered',
      field: 'market.languageCode',
      message: `Semrush used the ${market.countryCode} regional database; it does not apply the requested ${market.languageCode} as a separate language filter.`,
    },
    ...(market.device
      ? []
      : [
          {
            code: 'provider-device-defaulted',
            field: 'market.device',
            message: 'Semrush V3 regional research used desktop data.',
          },
        ]),
  ]
}

export function semrushKeywordDeprecationWarning(): ProviderWarning {
  return {
    code: 'semrush-v3-keyword-api-deprecated',
    message:
      'Semrush marks its Version 3 keyword endpoints as deprecated; this adapter keeps the provider-native observation and does not infer replacement data.',
  }
}
