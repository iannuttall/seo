// Page prose built from the data. Every sentence states a fact from the
// dataset or a number worked out from it, and a sentence is left out when
// its fact is missing. Never add what the data cannot show, such as how
// busy a car park gets or how to travel there. Change the wording here,
// never page by page.
import {
  facilities,
  formatHectares,
  listText,
  type Park,
  regionFor,
} from './parks'

// Ages are worked out from the year of the build. The site rebuilds when
// the data refreshes.
const YEAR = new Date().getFullYear()

export function answer(park: Park): string {
  const has = facilities(park)
  const offer = has.length
    ? `It has ${listText(has)}`
    : 'It has no toilets, cafe or playground'
  return `${park.name} is a park in ${park.region} that covers ${formatHectares(park.areaHectares)} and opened in ${park.opened}. ${offer}, and ${dogsSentence(park)}.`
}

function dogsSentence(park: Park): string {
  if (park.dogs === 'yes') return 'dogs are allowed'
  if (park.dogs === 'on leads') return 'dogs must stay on a lead'
  return 'dogs are not allowed'
}

export function story(park: Park): string[] {
  const region = regionFor(park)
  const others = region.parks.filter((entry) => entry.slug !== park.slug)
  const sentences: string[] = []

  const sizes = [...region.parks].sort(
    (a, b) => b.areaHectares - a.areaHectares,
  )
  const rank = sizes.findIndex((entry) => entry.slug === park.slug) + 1
  if (region.parks.length > 1) {
    sentences.push(
      rank === 1
        ? `It is the largest of the ${region.parks.length} parks in ${region.name}.`
        : rank === region.parks.length
          ? `It is the smallest of the ${region.parks.length} parks in ${region.name}.`
          : `It is number ${rank} of ${region.parks.length} by size in ${region.name}.`,
    )
  }

  // Compare with the average of the other parks only at either end of the
  // range, where the comparison says something a reader can use.
  const average =
    others.reduce((sum, entry) => sum + entry.areaHectares, 0) /
    Math.max(1, others.length)
  const ratio = average > 0 ? park.areaHectares / average : 1
  const other =
    others.length === 1 ? 'the other park there' : 'an average park there'
  if (others.length && rank === 1 && ratio >= 1.5) {
    sentences.push(
      `That makes it about ${Math.round(ratio)} times the size of ${other}.`,
    )
  } else if (others.length && rank === region.parks.length && ratio <= 0.67) {
    sentences.push(
      `${other.charAt(0).toUpperCase()}${other.slice(1)} is about ${Math.round(1 / ratio)} times its size.`,
    )
  }

  const age = YEAR - park.opened
  if (age >= 100) {
    sentences.push(`The park opened ${age} years ago, in ${park.opened}.`)
  }

  if (park.parkingSpaces === null) {
    sentences.push('The register does not list parking for this park.')
  } else if (park.parkingSpaces === 0) {
    sentences.push('The register lists no car park for this park.')
  } else {
    sentences.push(`The car park has ${park.parkingSpaces} spaces.`)
  }

  return sentences
}

export function faqs(park: Park): Array<{ question: string; answer: string }> {
  const list = [
    {
      question: `Are dogs allowed in ${park.name}?`,
      answer: `${capitalise(dogsSentence(park))} in ${park.name}.`,
    },
    {
      question: `Does ${park.name} have toilets?`,
      answer: park.toilets
        ? `Yes, ${park.name} has public toilets.`
        : `No, the register lists no public toilets at ${park.name}.`,
    },
    {
      question: `How big is ${park.name}?`,
      answer: `${park.name} covers ${formatHectares(park.areaHectares)}.`,
    },
  ]
  if (park.parkingSpaces !== null) {
    list.push({
      question: `Can you park at ${park.name}?`,
      answer: park.parkingSpaces
        ? `Yes, the car park has ${park.parkingSpaces} spaces.`
        : `No, ${park.name} has no car park.`,
    })
  }
  return list
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}
