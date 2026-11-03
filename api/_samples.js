// Plain-JS copy of the sample content (kept in sync with src/data/samples.ts by hand/generation).
export const SAMPLE_LESSONS = [
  {
    topic: 'Photosynthesis', subject: 'Science', characterId: 'bolt', language: 'en-IN',
    steps: [
      { say: 'Beep boop! Today we test a big question: how do plants make their own food? The answer is called photosynthesis.',
        board: [{ kind: 'title', text: 'Photosynthesis' }, { kind: 'text', text: 'How plants make food' }] },
      { say: 'A plant needs three things from outside. Sunlight, water from the soil, and carbon dioxide from the air.',
        board: [{ kind: 'bullet', text: 'Sunlight (energy)' }, { kind: 'bullet', text: 'Water (from roots)' }, { kind: 'bullet', text: 'Carbon dioxide (from air)' }, { kind: 'diagram', name: 'plant', labels: ['Roots drink water', 'Stem', 'Leaf makes food', 'Flower'] }] },
      { say: 'The green stuff in leaves is called chlorophyll. It catches sunlight, like a tiny solar panel!',
        board: [{ kind: 'text', text: 'Leaves have chlorophyll' }, { kind: 'drawing', shape: 'circle', label: 'chlorophyll = green' }] },
      { say: 'Inside the leaf, the plant mixes water and carbon dioxide using the light. It makes sugar for food and releases oxygen for us to breathe.',
        board: [{ kind: 'equation', text: 'water + carbon dioxide + light = sugar + oxygen' }, { kind: 'drawing', shape: 'arrow', label: 'oxygen out' }] },
      { say: 'Scientists grew two plants for four weeks. The plant in sunlight grew tall, and the plant in the dark stayed tiny. Light matters!',
        board: [{ kind: 'chart', chart: 'bar', labels: ['Week 1', 'Week 2', 'Week 3', 'Week 4'], values: [2, 5, 9, 14], title: 'Plant in sunlight (cm)' }, { kind: 'table', rows: [['Place', 'Height'], ['Sunny', '14 cm'], ['Dark', '3 cm']] }] },
      { say: 'So remember: plants use sunlight to make food and give us fresh air. Without photosynthesis there would be no life on Earth!',
        board: [{ kind: 'highlight', text: 'Plants turn sunlight into food and oxygen' }, { kind: 'drawing', shape: 'star' }] },
    ],
  },
  {
    topic: 'Water cycle', subject: 'Science', characterId: 'bolt', language: 'en-IN',
    steps: [
      { say: 'Beep boop! Rain, rivers and clouds are all one big loop. Today we follow a drop of water on its journey: the water cycle.',
        board: [{ kind: 'title', text: 'The Water Cycle' }, { kind: 'diagram', name: 'water-cycle' }] },
      { say: 'First, the Sun heats the sea and rivers. Water turns into invisible vapour and rises up. This is evaporation.',
        board: [{ kind: 'bullet', text: '**Evaporation**: water rises as vapour' }, { kind: 'drawing', shape: 'arrow', label: 'up!' }] },
      { say: 'High up it is cold, so the vapour cools and turns into tiny droplets that make clouds. This is condensation.',
        board: [{ kind: 'bullet', text: '**Condensation**: vapour makes clouds' }] },
      { say: 'When clouds get heavy, water falls as rain. Rivers carry it back to the sea, and the journey starts again!',
        board: [{ kind: 'bullet', text: '**Precipitation**: rain falls' }, { kind: 'table', rows: [['Step', 'What happens'], ['Evaporation', 'water to vapour'], ['Condensation', 'vapour to cloud'], ['Rain', 'water falls']] }] },
      { say: 'Remember: the same water goes round and round forever. It never runs out, it just travels!',
        board: [{ kind: 'highlight', text: 'Water goes round and round' }, { kind: 'drawing', shape: 'star' }] },
    ],
  },
  {
    topic: 'Fractions', subject: 'Maths', characterId: 'tara', language: 'en-IN',
    steps: [
      { say: 'Hoo-hoo! Let us solve a puzzle about sharing. A fraction is a part of a whole thing, like a slice of pizza.',
        board: [{ kind: 'title', text: 'Fractions' }, { kind: 'text', text: 'A fraction = part of a whole' }] },
      { say: 'Cut a pizza into 4 equal slices and eat 1. You ate one out of four parts, which we write as one over four.',
        board: [{ kind: 'equation', text: '1/4 = 1 part out of 4' }, { kind: 'fraction', num: 1, den: 4, label: '1 slice of 4' }] },
      { say: 'The top number is the numerator. It tells how many parts we have. The bottom number is the denominator. It tells how many equal parts make the whole.',
        board: [{ kind: 'bullet', text: 'Top = numerator (parts we have)' }, { kind: 'bullet', text: 'Bottom = denominator (parts in whole)' }] },
      { say: 'Adding is easy when the bottom numbers match. Just add the tops and keep the bottom the same. One quarter plus two quarters is three quarters.',
        board: [{ kind: 'example', text: 'Add fractions' }, { kind: 'equation', text: '1/4 + 2/4 = 3/4' }, { kind: 'fraction', num: 3, den: 4 }] },
      { say: 'Fractions live on the number line too! Start at zero and hop one half, then another half, and you land on one whole.',
        board: [{ kind: 'numberline', from: 0, to: 2, marks: [0.5, 1, 1.5], label: 'hops of 1/2' }, { kind: 'fraction', num: 5, den: 4, label: '5/4 is more than 1 whole' }] },
      { say: 'Great work! Remember, equal parts matter, and when denominators match you only add the numerators.',
        board: [{ kind: 'highlight', text: 'Same denominator: add the tops only' }, { kind: 'drawing', shape: 'star' }] },
    ],
  },
]

export const SAMPLE_QUIZZES = [
  {
    topic: 'Photosynthesis', language: 'en-IN',
    questions: [
      { id: 'q1', type: 'mcq', prompt: 'Which gas do plants take in for photosynthesis?', options: ['Oxygen', 'Carbon dioxide', 'Nitrogen', 'Hydrogen'], answer: 'Carbon dioxide', explanation: 'Plants take in carbon dioxide from the air through tiny holes in their leaves.' },
      { id: 'q2', type: 'truefalse', prompt: 'Plants release oxygen during photosynthesis.', options: ['True', 'False'], answer: 'True', explanation: 'Oxygen is made as a by-product, and we breathe it in.' },
      { id: 'q3', type: 'fill', prompt: 'The green pigment in leaves is called ______.', answer: 'chlorophyll', explanation: 'Chlorophyll catches sunlight and makes leaves green.' },
      { id: 'q4', type: 'mcq', prompt: 'Which part of the plant absorbs water from the soil?', options: ['Leaves', 'Flowers', 'Roots', 'Fruits'], answer: 'Roots', explanation: 'Roots soak up water and carry it to the plant.' },
      { id: 'q5', type: 'truefalse', prompt: 'Photosynthesis can happen in total darkness.', options: ['True', 'False'], answer: 'False', explanation: 'Plants need light energy to make their food.' },
    ],
  },
  {
    topic: 'Fractions', language: 'en-IN',
    questions: [
      { id: 'q1', type: 'mcq', prompt: 'A pizza is cut into 8 equal slices and you eat 3. What fraction did you eat?', options: ['3/5', '8/3', '3/8', '5/8'], answer: '3/8', explanation: 'You ate 3 parts out of 8 equal parts, so 3/8.' },
      { id: 'q2', type: 'fill', prompt: 'What is 1/5 + 2/5? Write the top number only, over 5.', answer: '3', explanation: 'The denominators match, so add the numerators: 1 + 2 = 3, giving 3/5.' },
      { id: 'q3', type: 'truefalse', prompt: 'In the fraction 3/4, the number 4 is the numerator.', options: ['True', 'False'], answer: 'False', explanation: 'The bottom number, 4, is the denominator.' },
      { id: 'q4', type: 'mcq', prompt: 'Which fraction is equal to one half?', options: ['2/4', '1/3', '3/4', '2/3'], answer: '2/4', explanation: '2/4 simplifies to 1/2.' },
      { id: 'q5', type: 'fill', prompt: 'How many quarters (1/4) make one whole?', answer: '4', explanation: 'Four quarters put together make one whole.' },
    ],
  },
]
