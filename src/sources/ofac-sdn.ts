// OFAC SDN source adapter implementation.
import { XMLParser } from "fast-xml-parser";
import { SourceAdapter, RawDoc, Term } from "./_adapter.js";

const OFAC_SDN_URL = "https://www.treasury.gov/ofac/downloads/sdn.xml";

interface OfacAka {
  uid: string | number;
  type: string;
  category: string;
  lastName: string;
  firstName?: string;
}

interface OfacAddress {
  uid: string | number;
  city?: string;
  country?: string;
  address1?: string;
  postalCode?: string;
}

interface OfacEntry {
  uid: string | number;
  lastName: string;
  firstName?: string;
  sdnType: "Entity" | "Individual" | "Vessel" | "Aircraft";
  remarks?: string;
  programList?: {
    program: string | string[];
  };
  akaList?: {
    aka: OfacAka | OfacAka[];
  };
  addressList?: {
    address: OfacAddress | OfacAddress[];
  };
  vesselInfo?: Record<string, unknown>;
}

function ensureArray<T>(val: T | T[] | undefined): T[] {
  if (val === undefined) return [];
  return Array.isArray(val) ? val : [val];
}

function asStr(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v);
}

function getDisplayName(obj: { firstName?: unknown; lastName: unknown }, sdnType: string): string {
  const last = asStr(obj.lastName);
  if (sdnType === "Individual" && obj.firstName !== undefined && obj.firstName !== null) {
    return `${asStr(obj.firstName)} ${last}`.trim();
  }
  return last.trim();
}

export const ofacSdnAdapter: SourceAdapter = {
  meta: {
    key: "ofac-sdn",
    name: "OFAC SDN",
    homepage: "https://ofac.treasury.gov/specially-designated-nationals-and-blocked-persons-list-sdn-human-readable-lists",
    license: {
      name: "Public Domain",
      attribution: "OFAC Specially Designated Nationals and Blocked Persons List, US Department of the Treasury (Public Domain).",
    },
  },

  async fetch(): Promise<RawDoc[]> {
    const response = await fetch(OFAC_SDN_URL);
    if (!response.ok) {
      throw new Error(`Failed to fetch OFAC SDN list: ${response.statusText}`);
    }
    const xmlData = await response.text();
    
    const parser = new XMLParser({
      ignoreAttributes: false,
      removeNSPrefix: true,
      parseTagValue: false,
      trimValues: true,
    });
    
    const parsed = parser.parse(xmlData);
    const sdnList = parsed.sdnList;
    if (!sdnList || !sdnList.sdnEntry) {
      return [];
    }

    const entries = ensureArray(sdnList.sdnEntry);
    return entries.map((entry: OfacEntry) => ({
      id: String(entry.uid),
      raw: entry,
    }));
  },

  normalize(doc: RawDoc): Term[] {
    const entry = doc.raw as OfacEntry;
    if (!entry || !entry.uid || !entry.lastName || !entry.sdnType) {
      return [];
    }

    const sdnType = entry.sdnType;
    const term = getDisplayName(entry, sdnType);
    
    const akas = entry.akaList ? ensureArray(entry.akaList.aka) : [];
    const rawAliases = akas.map(aka => getDisplayName(aka, sdnType));
    const aliases = [...new Set(rawAliases)].filter(a => a !== term);

    const programs = entry.programList ? ensureArray(entry.programList.program) : [];
    const addresses = entry.addressList ? ensureArray(entry.addressList.address) : [];

    // Definition construction
    let definition = `Sanctioned ${sdnType.toLowerCase()}.`;
    
    if (programs.length > 0) {
      definition += ` Programs: ${programs.join(", ")}.`;
    }

    const locationStrings = addresses
      .map(addr => {
        const parts = [];
        if (addr.city) parts.push(addr.city);
        if (addr.country) parts.push(addr.country);
        return parts.join(", ");
      })
      .filter(s => s.length > 0);
    
    const uniqueLocations = [...new Set(locationStrings)].slice(0, 3);
    if (uniqueLocations.length > 0) {
      definition += ` Locations: ${uniqueLocations.join(", ")}.`;
    }

    if (entry.remarks && entry.remarks.length < 200) {
      definition += ` Remarks: ${entry.remarks}.`;
    }

    return [
      {
        externalId: String(entry.uid),
        term,
        aliases,
        definition,
        category: "regulatory",
        metadata: {
          sdnType,
          programs,
          addresses: addresses.map(addr => ({
            city: addr.city,
            country: addr.country,
            address1: addr.address1,
            postalCode: addr.postalCode,
          })),
          akaCount: akas.length,
          strongAkaCount: akas.filter(a => a.category === "strong").length,
          remarks: entry.remarks || null,
          vesselInfo: entry.vesselInfo || null,
        },
      },
    ];
  },
};
