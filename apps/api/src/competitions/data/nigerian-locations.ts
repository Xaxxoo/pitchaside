export interface NigerianState {
  name: string;
  cities: string[];
}

export const NIGERIAN_STATES: NigerianState[] = [
  { name: 'Abia', cities: ['Aba', 'Umuahia', 'Ohafia', 'Arochukwu', 'Bende', 'Isiala Ngwa'] },
  { name: 'Adamawa', cities: ['Yola', 'Mubi', 'Jimeta', 'Numan', 'Ganye', 'Gombi'] },
  { name: 'Akwa Ibom', cities: ['Uyo', 'Eket', 'Ikot Ekpene', 'Oron', 'Abak', 'Ikot Abasi'] },
  { name: 'Anambra', cities: ['Awka', 'Onitsha', 'Nnewi', 'Ekwulobia', 'Aguata', 'Ihiala'] },
  { name: 'Bauchi', cities: ['Bauchi', 'Azare', 'Misau', 'Jama\'are', 'Katagum', 'Dass'] },
  { name: 'Bayelsa', cities: ['Yenagoa', 'Ogbia', 'Brass', 'Nembe', 'Sagbama', 'Ekeremor'] },
  { name: 'Benue', cities: ['Makurdi', 'Gboko', 'Otukpo', 'Katsina-Ala', 'Vandeikya', 'Oju'] },
  { name: 'Borno', cities: ['Maiduguri', 'Biu', 'Bama', 'Dikwa', 'Monguno', 'Gwoza'] },
  { name: 'Cross River', cities: ['Calabar', 'Ogoja', 'Ikom', 'Obudu', 'Ugep', 'Akamkpa'] },
  { name: 'Delta', cities: ['Asaba', 'Warri', 'Sapele', 'Ughelli', 'Agbor', 'Ozoro', 'Effurun'] },
  { name: 'Ebonyi', cities: ['Abakaliki', 'Afikpo', 'Onueke', 'Ezzamgbo', 'Ishiagu', 'Uburu'] },
  { name: 'Edo', cities: ['Benin City', 'Auchi', 'Ekpoma', 'Uromi', 'Igarra', 'Ubiaja'] },
  { name: 'Ekiti', cities: ['Ado-Ekiti', 'Ikere-Ekiti', 'Ijero-Ekiti', 'Ikole-Ekiti', 'Oye-Ekiti', 'Ilawe-Ekiti'] },
  { name: 'Enugu', cities: ['Enugu', 'Nsukka', 'Agbani', 'Oji River', 'Udi', 'Awgu'] },
  { name: 'FCT', cities: ['Abuja', 'Gwagwalada', 'Kuje', 'Bwari', 'Kwali', 'Abaji'] },
  { name: 'Gombe', cities: ['Gombe', 'Kaltungo', 'Billiri', 'Bajoga', 'Deba', 'Kumo'] },
  { name: 'Imo', cities: ['Owerri', 'Orlu', 'Okigwe', 'Oguta', 'Mbaise', 'Nkwerre'] },
  { name: 'Jigawa', cities: ['Dutse', 'Hadejia', 'Gumel', 'Kazaure', 'Birnin Kudu', 'Ringim'] },
  { name: 'Kaduna', cities: ['Kaduna', 'Zaria', 'Kafanchan', 'Kagoro', 'Saminaka', 'Birnin Gwari'] },
  { name: 'Kano', cities: ['Kano', 'Wudil', 'Gwarzo', 'Rano', 'Bichi', 'Dala', 'Fagge'] },
  { name: 'Katsina', cities: ['Katsina', 'Daura', 'Funtua', 'Malumfashi', 'Kankia', 'Dutsin-Ma'] },
  { name: 'Kebbi', cities: ['Birnin Kebbi', 'Argungu', 'Yauri', 'Zuru', 'Jega', 'Bagudo'] },
  { name: 'Kogi', cities: ['Lokoja', 'Okene', 'Idah', 'Kabba', 'Ankpa', 'Ajaokuta'] },
  { name: 'Kwara', cities: ['Ilorin', 'Offa', 'Jebba', 'Lafiagi', 'Omu-Aran', 'Pategi'] },
  { name: 'Lagos', cities: ['Lagos', 'Ikeja', 'Lekki', 'Victoria Island', 'Surulere', 'Ikorodu', 'Epe', 'Badagry', 'Ajah', 'Yaba'] },
  { name: 'Nasarawa', cities: ['Lafia', 'Keffi', 'Akwanga', 'Nasarawa', 'Doma', 'Toto'] },
  { name: 'Niger', cities: ['Minna', 'Bida', 'Kontagora', 'Suleja', 'Lapai', 'Agaie'] },
  { name: 'Ogun', cities: ['Abeokuta', 'Sagamu', 'Ijebu-Ode', 'Ota', 'Ilaro', 'Ayetoro'] },
  { name: 'Ondo', cities: ['Akure', 'Ondo', 'Owo', 'Ikare', 'Okitipupa', 'Ore'] },
  { name: 'Osun', cities: ['Osogbo', 'Ile-Ife', 'Ilesa', 'Ede', 'Iwo', 'Ejigbo'] },
  { name: 'Oyo', cities: ['Ibadan', 'Ogbomoso', 'Oyo', 'Iseyin', 'Saki', 'Eruwa'] },
  { name: 'Plateau', cities: ['Jos', 'Bukuru', 'Pankshin', 'Shendam', 'Langtang', 'Barkin Ladi'] },
  { name: 'Rivers', cities: ['Port Harcourt', 'Obio-Akpor', 'Bonny', 'Degema', 'Okrika', 'Eleme'] },
  { name: 'Sokoto', cities: ['Sokoto', 'Tambuwal', 'Bodinga', 'Illela', 'Gwadabawa', 'Wurno'] },
  { name: 'Taraba', cities: ['Jalingo', 'Wukari', 'Bali', 'Takum', 'Serti', 'Gembu'] },
  { name: 'Yobe', cities: ['Damaturu', 'Potiskum', 'Gashua', 'Nguru', 'Geidam', 'Bade'] },
  { name: 'Zamfara', cities: ['Gusau', 'Kaura Namoda', 'Talata Mafara', 'Anka', 'Maru', 'Bungudu'] },
];

export const ALL_STATE_NAMES = NIGERIAN_STATES.map((s) => s.name);

export function getCitiesForState(stateName: string): string[] {
  return NIGERIAN_STATES.find((s) => s.name === stateName)?.cities ?? [];
}

export function isValidState(stateName: string): boolean {
  return ALL_STATE_NAMES.includes(stateName);
}

export function isValidCity(stateName: string, cityName: string): boolean {
  return getCitiesForState(stateName).includes(cityName);
}
