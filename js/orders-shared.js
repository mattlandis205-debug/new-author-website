// Book catalog + order helpers, shared by the order page, admin and the Netlify Function.

export const BOOKS = [
  {
    id: 'nah2', title: 'National Archive Hunters #2: Eternal Flame', short: 'National Archive Hunters #2',
    format: 'Hardback', price: 15, grades: 'Grades 3-7', cover: '/images/covers/eternal flame cover.webp',
    awards: ['JLG Gold Standard Selection'],
    blurb: "Twins Ike and Iris Carter race from D.C. to Paris to New York on the trail of one of America's most iconic treasures, before it disappears like smoke!"
  },
  {
    id: 'nah1', title: 'National Archive Hunters #1: Capitol Chase', short: 'National Archive Hunters #1',
    format: 'Paperback', price: 10, grades: 'Grades 3-7', cover: '/images/covers/capitol chase cover.webp',
    awards: ['Booklist starred review', 'JLG Gold Standard Selection'],
    blurb: "Ten-year-old twins Iris and Ike race to find the thief stealing valuable historical artifacts before their family's framed for the crimes."
  },
  {
    id: 'nobody', title: 'The Not-So-Boring Letters of Private Nobody', short: 'Private Nobody',
    format: 'Paperback', price: 10, grades: 'Grades 4-8', cover: '/images/covers/Private Nobody cover.webp',
    awards: ['Winner: Magnolia Book Award', "Bank Street's Best Book", "ILA Teachers' Choices", 'JLG Gold Standard Selection'],
    blurb: "A trio of seventh graders become one another's first friends as they discover the secrets of a Civil War soldier during a social studies project gone wrong."
  },
  {
    id: 'endworld', title: "It's the End of the World as I Know It", short: 'End of the World',
    format: 'Hardback', price: 15, grades: 'Grades 5-8', cover: '/images/covers/End of the world cover.webp',
    awards: ['School Library Journal starred review', 'Nominated: Virginia Readers\' Choice, Missouri Truman, Oklahoma Sequoyah & South Dakota Teen awards', 'JLG Gold Standard Selection'],
    blurb: 'Twelve-year-old Derrick thinks the world is ending in nineteen days, and his friends have to pull him from his doomsday ways in this moving novel about grief, hope, and family.'
  },
  {
    id: 'ofn', title: 'Operation Final Notice', short: 'Operation Final Notice',
    format: 'Paperback', price: 10, grades: 'Grades 4-8', cover: '/images/covers/Operation Final Notice Cover.webp',
    awards: ['Nominated: Washington State Sasquatch Award'],
    blurb: 'Ronny has four weeks to save the family car from repossession. His best friend Jo has the same four weeks to beat stage fright and nail a cello audition.'
  }
];

export const CAMP_Q = "Do you want more info about Matt's creative writing camp this summer?";
export const CAMP_YES = 'Yes! (Matt will email you a flyer!)';
export const CAMP_NO = 'No thanks (Matt will probably still email you a flyer hahahah)';
export const POD_Q = 'Matt hosts a hilarious and informative history podcast for students called AMERICAN MADE. Do you want to be added to the bimonthly episode drops? They are FREE!';
export const POD_YES = 'COUNT ME IN!';
export const POD_NO = "Nah, I'll keep listening to boring stuff or scary world news";

export const MAX_QTY = 20;

// Books offered on a school's page, with that school's prices applied.
export function booksFor(settings = {}) {
  const prices = settings.prices || {};
  const hidden = new Set(settings.hidden || []);
  return BOOKS.filter(b => !hidden.has(b.id)).map(b => ({
    ...b,
    price: Number.isFinite(Number(prices[b.id])) && prices[b.id] !== '' && prices[b.id] != null ? Number(prices[b.id]) : b.price
  }));
}

export function orderTotal(items) {
  return (items || []).reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.price) || 0), 0);
}

export function slugify(s) {
  return String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
}
