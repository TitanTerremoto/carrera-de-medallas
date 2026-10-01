/*
 * Banco de preguntas de "Carrera de Medallas".
 *
 * Para agregar una pregunta basta con sumar un objeto a la lista de su
 * categoría con este formato:
 *
 *   {
 *     q: 'Enunciado de la pregunta',
 *     correct: 'Respuesta correcta',
 *     wrong: ['Incorrecta 1', 'Incorrecta 2', 'Incorrecta 3'],
 *     explain: 'Explicación breve que se muestra al responder',
 *   }
 *
 * Categorías: tipos, pokedex, habilidades, cambalache y liga.
 *
 * El juego mezcla las opciones en cada aparición, así que el orden en el
 * que se escriben aquí no importa. Cada pregunta debe tener exactamente
 * tres respuestas incorrectas (cuatro opciones en total).
 */
window.QUESTION_BANK = {
  // ── TIPOS: efectividades, debilidades, inmunidades y combinaciones ──
  tipos: [
    {
      q: '¿Qué tipo de ataque es súper eficaz contra el tipo Agua?',
      correct: 'Planta',
      wrong: ['Fuego', 'Hielo', 'Acero'],
      explain: 'Planta (y también Eléctrico) hacen el doble de daño al tipo Agua.',
    },
    {
      q: '¿Qué tipo es inmune a los ataques de tipo Normal?',
      correct: 'Fantasma',
      wrong: ['Roca', 'Acero', 'Psíquico'],
      explain: 'Los ataques Normal no afectan a Fantasma. Roca y Acero solo los resisten.',
    },
    {
      q: '¿A qué tipo de ataques es inmune el tipo Volador?',
      correct: 'Tierra',
      wrong: ['Eléctrico', 'Roca', 'Hielo'],
      explain: 'Los Pokémon Volador no reciben daño de ataques de tipo Tierra.',
    },
    {
      q: '¿Qué tipo es inmune a los ataques de tipo Dragón?',
      correct: 'Hada',
      wrong: ['Acero', 'Hielo', 'Dragón'],
      explain: 'Hada es inmune a Dragón. Acero solo lo resiste y Dragón es débil a Dragón.',
    },
    {
      q: '¿Qué tipo es inmune a los ataques de tipo Eléctrico?',
      correct: 'Tierra',
      wrong: ['Planta', 'Dragón', 'Agua'],
      explain: 'Tierra anula los ataques Eléctrico. Planta y Dragón solo los resisten.',
    },
    {
      q: '¿Qué tipo de ataque es súper eficaz contra el tipo Hada?',
      correct: 'Acero',
      wrong: ['Dragón', 'Lucha', 'Siniestro'],
      explain: 'Acero y Veneno son súper eficaces contra Hada; Hada resiste Lucha, Siniestro y anula Dragón.',
    },
    {
      q: 'Un ataque de tipo Hielo contra Hoppip (Planta/Volador), ¿cuánto daño hace?',
      correct: 'x4',
      wrong: ['x2', 'x1', 'x0,5'],
      explain: 'Hielo es súper eficaz contra Planta y contra Volador: 2 × 2 = x4.',
    },
    {
      q: '¿Qué tipo es inmune a los ataques de tipo Psíquico?',
      correct: 'Siniestro',
      wrong: ['Fantasma', 'Acero', 'Hada'],
      explain: 'Siniestro es inmune a Psíquico. Acero solo lo resiste.',
    },
    {
      q: '¿Qué tipo es inmune a los ataques de tipo Veneno?',
      correct: 'Acero',
      wrong: ['Roca', 'Tierra', 'Fantasma'],
      explain: 'Veneno no afecta a Acero. Roca, Tierra y Fantasma solo lo resisten.',
    },
    {
      q: '¿Qué tipo es inmune a los ataques de tipo Lucha?',
      correct: 'Fantasma',
      wrong: ['Psíquico', 'Volador', 'Hada'],
      explain: 'Los golpes de Lucha atraviesan a los Fantasma sin hacerles daño.',
    },
    {
      q: '¿Contra cuál de estos tipos es súper eficaz el Fuego?',
      correct: 'Acero',
      wrong: ['Roca', 'Agua', 'Dragón'],
      explain: 'Fuego derrite al Acero; en cambio Roca, Agua y Dragón resisten el Fuego.',
    },
    {
      q: '¿De qué tipos es Charizard?',
      correct: 'Fuego/Volador',
      wrong: ['Fuego/Dragón', 'Fuego', 'Fuego/Lucha'],
      explain: 'Pese a su aspecto de dragón, Charizard es Fuego/Volador.',
    },
    {
      q: '¿Cuál de estos Pokémon es de tipo Eléctrico puro?',
      correct: 'Pikachu',
      wrong: ['Magnemite', 'Rotom', 'Zapdos'],
      explain: 'Magnemite es Eléctrico/Acero, Rotom Eléctrico/Fantasma y Zapdos Eléctrico/Volador.',
    },
    {
      q: '¿Qué tipo tiene Gengar además de Fantasma?',
      correct: 'Veneno',
      wrong: ['Siniestro', 'Psíquico', 'Hada'],
      explain: 'Gengar, igual que Gastly y Haunter, es Fantasma/Veneno.',
    },
    {
      q: '¿Cuántas debilidades tiene un Pokémon de tipo Acero puro?',
      correct: '3',
      wrong: ['2', '4', '1'],
      explain: 'Acero es débil a Fuego, Lucha y Tierra.',
    },
    {
      q: '¿Qué combinación de tipos tiene Gyarados?',
      correct: 'Agua/Volador',
      wrong: ['Agua/Dragón', 'Agua/Siniestro', 'Agua'],
      explain: 'Gyarados es Agua/Volador, por eso Eléctrico le hace x4.',
    },
    {
      q: '¿Contra cuál de estos tipos es súper eficaz el tipo Tierra?',
      correct: 'Eléctrico',
      wrong: ['Planta', 'Bicho', 'Volador'],
      explain: 'Tierra vence a Eléctrico. Planta y Bicho lo resisten y Volador es inmune.',
    },
    {
      q: '¿Qué tipo resiste los ataques de tipo Fantasma?',
      correct: 'Siniestro',
      wrong: ['Psíquico', 'Fantasma', 'Lucha'],
      explain: 'Siniestro resiste a Fantasma; Psíquico y Fantasma, en cambio, son débiles.',
    },
    {
      q: '¿Cuál de estos Pokémon es de tipo Hielo/Volador?',
      correct: 'Articuno',
      wrong: ['Lapras', 'Dewgong', 'Snorunt'],
      explain: 'Articuno es Hielo/Volador. Lapras y Dewgong son Agua/Hielo y Snorunt es Hielo.',
    },
    {
      q: '¿Qué tipo de ataque es súper eficaz contra el tipo Dragón?',
      correct: 'Hielo',
      wrong: ['Fuego', 'Agua', 'Eléctrico'],
      explain: 'Hielo, Dragón y Hada vencen a Dragón; Fuego, Agua, Eléctrico y Planta son resistidos.',
    },
    {
      q: 'Un ataque de tipo Tierra contra Magnemite (Eléctrico/Acero), ¿cuánto daño hace?',
      correct: 'x4',
      wrong: ['x2', 'x1', 'x0'],
      explain: 'Tierra es súper eficaz contra Eléctrico y contra Acero: 2 × 2 = x4.',
    },
    {
      q: '¿Qué tipo de ataque es súper eficaz contra el tipo Fantasma?',
      correct: 'Siniestro',
      wrong: ['Lucha', 'Normal', 'Veneno'],
      explain: 'Siniestro y Fantasma son súper eficaces contra Fantasma.',
    },
    {
      q: '¿Contra cuál de estos tipos es súper eficaz el tipo Bicho?',
      correct: 'Psíquico',
      wrong: ['Fuego', 'Volador', 'Hada'],
      explain: 'Bicho vence a Psíquico, Planta y Siniestro; Fuego, Volador y Hada lo resisten.',
    },
  ],

  // ── POKÉDEX: números, altura, peso, comparaciones y orden ──
  pokedex: [
    {
      q: '¿Qué número tiene Bulbasaur en la Pokédex Nacional?',
      correct: '#001',
      wrong: ['#004', '#007', '#151'],
      explain: 'Bulbasaur abre la Pokédex Nacional con el número 001.',
    },
    {
      q: '¿Qué Pokémon ocupa el número 025 de la Pokédex Nacional?',
      correct: 'Pikachu',
      wrong: ['Raichu', 'Pichu', 'Jigglypuff'],
      explain: 'Pikachu es el #025; Raichu es el #026 y Pichu el #172.',
    },
    {
      q: '¿Qué número tiene Mew en la Pokédex Nacional?',
      correct: '#151',
      wrong: ['#150', '#152', '#251'],
      explain: 'Mew cierra la primera generación con el #151.',
    },
    {
      q: '¿Qué Pokémon ocupa el número 150?',
      correct: 'Mewtwo',
      wrong: ['Mew', 'Dragonite', 'Celebi'],
      explain: 'Mewtwo es el #150, Dragonite el #149 y Celebi el #251.',
    },
    {
      q: '¿Qué Pokémon viene justo después de Squirtle (#007)?',
      correct: 'Wartortle',
      wrong: ['Blastoise', 'Caterpie', 'Charmander'],
      explain: 'Wartortle es el #008, Blastoise el #009 y Caterpie el #010.',
    },
    {
      q: '¿Cuánto mide Pikachu según la Pokédex?',
      correct: '0,4 m',
      wrong: ['0,8 m', '1,0 m', '0,2 m'],
      explain: 'Pikachu mide 0,4 m y pesa 6 kg.',
    },
    {
      q: '¿Cuánto pesa Snorlax según la Pokédex?',
      correct: '460 kg',
      wrong: ['120 kg', '46 kg', '999,9 kg'],
      explain: 'Snorlax pesa 460 kg; ¡por eso bloquea caminos enteros!',
    },
    {
      q: '¿Cuál de estos Pokémon es el más alto?',
      correct: 'Wailord',
      wrong: ['Onix', 'Gyarados', 'Rayquaza'],
      explain: 'Wailord mide 14,5 m; Onix 8,8 m, Rayquaza 7,0 m y Gyarados 6,5 m.',
    },
    {
      q: '¿Cuál de estos Pokémon es el más pesado?',
      correct: 'Groudon',
      wrong: ['Snorlax', 'Wailord', 'Onix'],
      explain: 'Groudon pesa 950 kg; Snorlax 460 kg, Wailord 398 kg y Onix 210 kg.',
    },
    {
      q: '¿Cuál de estos Pokémon tiene el número de Pokédex más bajo?',
      correct: 'Eevee',
      wrong: ['Togepi', 'Gardevoir', 'Lucario'],
      explain: 'Eevee es el #133, Togepi el #175, Gardevoir el #282 y Lucario el #448.',
    },
    {
      q: '¿Qué número tiene Charmander en la Pokédex Nacional?',
      correct: '#004',
      wrong: ['#005', '#006', '#007'],
      explain: 'Charmander es el #004; le siguen Charmeleon (#005) y Charizard (#006).',
    },
    {
      q: '¿Qué número tiene Chikorita, el primer Pokémon de la segunda generación?',
      correct: '#152',
      wrong: ['#151', '#155', '#158'],
      explain: 'Chikorita es el #152; Cyndaquil es el #155 y Totodile el #158.',
    },
    {
      q: '¿Qué Pokémon ocupa el número 094?',
      correct: 'Gengar',
      wrong: ['Haunter', 'Gastly', 'Alakazam'],
      explain: 'Gastly #092, Haunter #093 y Gengar #094. Alakazam es el #065.',
    },
    {
      q: '¿Cuánto mide Onix según la Pokédex?',
      correct: '8,8 m',
      wrong: ['3,5 m', '12,0 m', '5,2 m'],
      explain: 'Onix mide 8,8 m de largo y pesa 210 kg.',
    },
    {
      q: '¿Qué número tiene Lucario en la Pokédex Nacional?',
      correct: '#448',
      wrong: ['#447', '#384', '#493'],
      explain: 'Lucario es el #448, justo después de Riolu (#447).',
    },
    {
      q: '¿Qué número tiene Rayquaza en la Pokédex Nacional?',
      correct: '#384',
      wrong: ['#383', '#382', '#386'],
      explain: 'Kyogre #382, Groudon #383, Rayquaza #384 y Deoxys #386.',
    },
    {
      q: '¿Cuál de estos Pokémon pesa menos?',
      correct: 'Gastly',
      wrong: ['Pikachu', 'Jigglypuff', 'Eevee'],
      explain: 'Gastly pesa apenas 0,1 kg porque está hecho casi todo de gas.',
    },
    {
      q: '¿Qué número tiene Jigglypuff en la Pokédex Nacional?',
      correct: '#039',
      wrong: ['#040', '#035', '#052'],
      explain: 'Jigglypuff es el #039 y Wigglytuff el #040. Clefairy es el #035.',
    },
    {
      q: '¿Qué número tiene Torchic en la Pokédex Nacional?',
      correct: '#255',
      wrong: ['#252', '#258', '#261'],
      explain: 'Treecko #252, Torchic #255 y Mudkip #258.',
    },
    {
      q: '¿Qué número tiene Arceus en la Pokédex Nacional?',
      correct: '#493',
      wrong: ['#386', '#649', '#500'],
      explain: 'Arceus es el #493, el último Pokémon de la cuarta generación.',
    },
    {
      q: '¿Qué número tiene Snorlax en la Pokédex Nacional?',
      correct: '#143',
      wrong: ['#134', '#149', '#131'],
      explain: 'Snorlax es el #143; Lapras es el #131 y Dragonite el #149.',
    },
    {
      q: '¿Cuál de estos Pokémon aparece primero en la Pokédex Nacional?',
      correct: 'Psyduck',
      wrong: ['Machop', 'Geodude', 'Ponyta'],
      explain: 'Psyduck #054, Machop #066, Geodude #074 y Ponyta #077.',
    },
    {
      q: '¿Cuánto pesa Wailord según la Pokédex?',
      correct: '398 kg',
      wrong: ['950 kg', '120 kg', '39,8 kg'],
      explain: 'Wailord pesa 398 kg, ligero para sus 14,5 m de largo.',
    },
    {
      q: '¿Cuánto mide Charizard según la Pokédex?',
      correct: '1,7 m',
      wrong: ['2,5 m', '1,1 m', '3,0 m'],
      explain: 'Charizard mide 1,7 m y pesa 90,5 kg.',
    },
  ],

  // ── HABILIDADES Y MOVIMIENTOS: efectos, potencia, precisión, prioridad ──
  habilidades: [
    {
      q: '¿Qué hace la habilidad Levitación?',
      correct: 'Da inmunidad a los movimientos de tipo Tierra',
      wrong: [
        'Duplica la Velocidad con lluvia',
        'Evita ser debilitado de un solo golpe',
        'Recupera PS al recibir ataques eléctricos',
      ],
      explain: 'Un Pokémon con Levitación flota y no le afectan los ataques Tierra.',
    },
    {
      q: '¿Qué hace la habilidad Intimidación?',
      correct: 'Baja el Ataque de los rivales al entrar en combate',
      wrong: [
        'Sube el Ataque propio al recibir un golpe',
        'Impide que el rival huya',
        'Baja la Defensa de los rivales al entrar',
      ],
      explain: 'Intimidación reduce un nivel el Ataque de los rivales al salir al campo.',
    },
    {
      q: '¿Qué habilidad comparten los iniciales de tipo Fuego como Charmander o Torchic?',
      correct: 'Mar Llamas',
      wrong: ['Espesura', 'Torrente', 'Absorbe Fuego'],
      explain: 'Mar Llamas potencia los ataques Fuego con pocos PS. Espesura y Torrente son las de Planta y Agua.',
    },
    {
      q: '¿Qué potencia tiene el movimiento Hiperrayo?',
      correct: '150',
      wrong: ['120', '90', '200'],
      explain: 'Hiperrayo tiene 150 de potencia, pero el usuario debe recargar el turno siguiente.',
    },
    {
      q: '¿Qué prioridad tiene Ataque Rápido?',
      correct: '+1',
      wrong: ['0', '+2', '-1'],
      explain: 'Ataque Rápido tiene prioridad +1: suele golpear antes que el rival.',
    },
    {
      q: '¿Qué prioridad tiene el movimiento Protección?',
      correct: '+4',
      wrong: ['+1', '+2', '0'],
      explain: 'Protección tiene prioridad +4 para actuar antes que casi cualquier ataque.',
    },
    {
      q: '¿Qué precisión tiene Hidrobomba?',
      correct: '80 %',
      wrong: ['100 %', '70 %', '90 %'],
      explain: 'Hidrobomba es potente (110) pero tiene un 80 % de precisión.',
    },
    {
      q: '¿Qué le ocurre al Pokémon que usa Explosión?',
      correct: 'Se debilita',
      wrong: ['Pierde la mitad de sus PS', 'Queda paralizado', 'No puede moverse el turno siguiente'],
      explain: 'Explosión causa muchísimo daño, pero el usuario se debilita.',
    },
    {
      q: '¿Qué potencia tiene Terremoto?',
      correct: '100',
      wrong: ['120', '80', '90'],
      explain: 'Terremoto tiene 100 de potencia y 100 % de precisión.',
    },
    {
      q: '¿Qué potencia tiene el movimiento Rayo?',
      correct: '90',
      wrong: ['120', '60', '150'],
      explain: 'Rayo tiene 90 de potencia y puede paralizar al objetivo.',
    },
    {
      q: '¿Qué efecto adicional puede causar Rayo Hielo?',
      correct: 'Congelar al objetivo',
      wrong: ['Paralizar al objetivo', 'Quemar al objetivo', 'Bajar la Velocidad del usuario'],
      explain: 'Rayo Hielo tiene un 10 % de probabilidad de congelar.',
    },
    {
      q: '¿Qué hace Danza Espada?',
      correct: 'Sube mucho el Ataque del usuario',
      wrong: ['Baja la Defensa del rival', 'Sube la Velocidad del usuario', 'Golpea dos veces'],
      explain: 'Danza Espada sube dos niveles el Ataque del usuario.',
    },
    {
      q: '¿Qué hace la habilidad Robustez?',
      correct: 'Evita ser debilitado de un golpe si tiene los PS al máximo',
      wrong: [
        'Reduce el daño de los golpes críticos',
        'Sube la Defensa al recibir un golpe',
        'Impide que bajen sus características',
      ],
      explain: 'Con Robustez y PS completos, el Pokémon aguanta con 1 PS un golpe que lo debilitaría.',
    },
    {
      q: '¿Qué hace la habilidad Nado Rápido?',
      correct: 'Duplica la Velocidad cuando llueve',
      wrong: ['Recupera PS cuando llueve', 'Hace llover al entrar en combate', 'Potencia los ataques Agua'],
      explain: 'Nado Rápido duplica la Velocidad bajo la lluvia.',
    },
    {
      q: '¿Qué hace la habilidad Electricidad Estática?',
      correct: 'Puede paralizar a quien la toque con un ataque de contacto',
      wrong: [
        'Atrae los ataques eléctricos',
        'Potencia los ataques eléctricos',
        'Da inmunidad a la parálisis',
      ],
      explain: 'Hay un 30 % de probabilidad de paralizar al atacante que haga contacto.',
    },
    {
      q: '¿Cuál de estos movimientos nunca falla?',
      correct: 'Golpe Aéreo',
      wrong: ['Hidrobomba', 'Trueno', 'Llamarada'],
      explain: 'Golpe Aéreo ignora la precisión y la evasión: siempre acierta.',
    },
    {
      q: '¿Cuál de estos Pokémon puede aprender Surf?',
      correct: 'Lapras',
      wrong: ['Charizard', 'Butterfree', 'Pidgeot'],
      explain: 'Lapras es uno de los transportes acuáticos más clásicos gracias a Surf.',
    },
    {
      q: '¿Cuál de estos Pokémon puede aprender Vuelo?',
      correct: 'Pidgeot',
      wrong: ['Lapras', 'Blastoise', 'Snorlax'],
      explain: 'Pidgeot, como muchos Pokémon pájaro, puede aprender Vuelo.',
    },
    {
      q: '¿Qué precisión tiene el movimiento Trueno?',
      correct: '70 %',
      wrong: ['100 %', '85 %', '50 %'],
      explain: 'Trueno tiene 70 % de precisión, aunque nunca falla con lluvia.',
    },
    {
      q: '¿Qué movimiento eléctrico también daña al usuario por retroceso?',
      correct: 'Placaje Eléctrico',
      wrong: ['Impactrueno', 'Onda Trueno', 'Chispa'],
      explain: 'Placaje Eléctrico es muy potente, pero el usuario recibe daño de retroceso.',
    },
    {
      q: '¿Qué hace Gigadrenado?',
      correct: 'Recupera PS iguales a la mitad del daño causado',
      wrong: ['Duerme al rival', 'Recupera todos los PS', 'Envenena al rival'],
      explain: 'Gigadrenado absorbe energía: el usuario recupera la mitad del daño infligido.',
    },
    {
      q: '¿Qué potencia tiene Llamarada?',
      correct: '110',
      wrong: ['90', '120', '150'],
      explain: 'Llamarada tiene 110 de potencia y 85 % de precisión.',
    },
    {
      q: '¿Qué hace la habilidad Absorbe Agua?',
      correct: 'Recupera PS al recibir ataques de tipo Agua',
      wrong: ['Sube la Defensa con lluvia', 'Potencia los ataques Agua', 'Evita las quemaduras'],
      explain: 'En lugar de recibir daño, el Pokémon se cura con los ataques Agua.',
    },
    {
      q: '¿Qué prioridad tiene Velocidad Extrema?',
      correct: '+2',
      wrong: ['+1', '+3', '0'],
      explain: 'Velocidad Extrema tiene prioridad +2, más que Ataque Rápido.',
    },
  ],

  // ── CAMBALACHE: regiones, objetos, evoluciones, entrenadores y curiosidades ──
  cambalache: [
    {
      q: '¿En qué región comienza la aventura de la primera generación?',
      correct: 'Kanto',
      wrong: ['Johto', 'Hoenn', 'Sinnoh'],
      explain: 'Pokémon Rojo y Azul transcurren en Kanto.',
    },
    {
      q: '¿Qué región se explora en Pokémon Oro y Plata?',
      correct: 'Johto',
      wrong: ['Kanto', 'Teselia', 'Kalos'],
      explain: 'Johto es la región de la segunda generación.',
    },
    {
      q: '¿Qué región se explora en Pokémon Rubí y Zafiro?',
      correct: 'Hoenn',
      wrong: ['Sinnoh', 'Alola', 'Galar'],
      explain: 'Hoenn, región de islas y mar, es la de la tercera generación.',
    },
    {
      q: '¿Qué región se explora en Pokémon Diamante y Perla?',
      correct: 'Sinnoh',
      wrong: ['Hoenn', 'Johto', 'Paldea'],
      explain: 'Sinnoh es la región de la cuarta generación.',
    },
    {
      q: '¿Cómo se llama el profesor que entrega el primer Pokémon en Kanto?',
      correct: 'Profesor Oak',
      wrong: ['Profesor Elm', 'Profesor Abedul', 'Profesor Serbal'],
      explain: 'El Profesor Oak vive en Pueblo Paleta.',
    },
    {
      q: '¿Qué objeto hace evolucionar a Pikachu?',
      correct: 'Piedra Trueno',
      wrong: ['Piedra Lunar', 'Piedra Fuego', 'Caramelo Raro'],
      explain: 'Pikachu evoluciona a Raichu con una Piedra Trueno.',
    },
    {
      q: '¿Qué Poké Ball atrapa a cualquier Pokémon sin fallar?',
      correct: 'Master Ball',
      wrong: ['Ultra Ball', 'Super Ball', 'Honor Ball'],
      explain: 'La Master Ball garantiza la captura.',
    },
    {
      q: '¿Con qué objeto evoluciona Eevee a Vaporeon?',
      correct: 'Piedra Agua',
      wrong: ['Piedra Hielo', 'Piedra Lunar', 'Piedra Hoja'],
      explain: 'La Piedra Agua convierte a Eevee en Vaporeon.',
    },
    {
      q: '¿En qué Pokémon evoluciona Magikarp?',
      correct: 'Gyarados',
      wrong: ['Milotic', 'Seaking', 'Kingdra'],
      explain: 'El humilde Magikarp se transforma en el temible Gyarados.',
    },
    {
      q: '¿Cuántas evoluciones distintas tiene Eevee?',
      correct: '8',
      wrong: ['5', '7', '9'],
      explain: 'Vaporeon, Jolteon, Flareon, Espeon, Umbreon, Leafeon, Glaceon y Sylveon.',
    },
    {
      q: '¿Cuál de estos Pokémon evoluciona al ser intercambiado?',
      correct: 'Kadabra',
      wrong: ['Pikachu', 'Charmeleon', 'Ivysaur'],
      explain: 'Kadabra evoluciona a Alakazam cuando se intercambia.',
    },
    {
      q: 'Además del Mega Aro, ¿qué necesita un Pokémon para megaevolucionar?',
      correct: 'Su Megapiedra',
      wrong: ['Una Piedra Lunar', 'Un Cristal Z', 'Un Caramelo Raro'],
      explain: 'Cada megaevolución requiere la Megapiedra específica de ese Pokémon.',
    },
    {
      q: '¿De qué tipo es la forma de Alola de Vulpix?',
      correct: 'Hielo',
      wrong: ['Fuego', 'Hada', 'Agua'],
      explain: 'El Vulpix de Alola vive en la nieve y es de tipo Hielo.',
    },
    {
      q: '¿Qué objeto hace subir un nivel a un Pokémon?',
      correct: 'Caramelo Raro',
      wrong: ['Poción', 'Más PS', 'Piedra Eterna'],
      explain: 'El Caramelo Raro sube instantáneamente un nivel.',
    },
    {
      q: '¿Cuál es el primer Pokémon de Ash en la serie animada?',
      correct: 'Pikachu',
      wrong: ['Charmander', 'Bulbasaur', 'Squirtle'],
      explain: 'El Profesor Oak le entregó a Ash su inseparable Pikachu.',
    },
    {
      q: '¿Qué región se explora en Pokémon X e Y?',
      correct: 'Kalos',
      wrong: ['Galar', 'Teselia', 'Alola'],
      explain: 'Kalos es la región de la sexta generación.',
    },
    {
      q: '¿Qué región está inspirada en Hawái?',
      correct: 'Alola',
      wrong: ['Hoenn', 'Galar', 'Paldea'],
      explain: 'Alola, de Pokémon Sol y Luna, está inspirada en Hawái.',
    },
    {
      q: '¿Con qué objeto evoluciona Clefairy?',
      correct: 'Piedra Lunar',
      wrong: ['Piedra Solar', 'Piedra Alba', 'Piedra Día'],
      explain: 'Clefairy evoluciona a Clefable con una Piedra Lunar.',
    },
    {
      q: '¿Qué región se explora en Pokémon Escarlata y Púrpura?',
      correct: 'Paldea',
      wrong: ['Galar', 'Kalos', 'Sinnoh'],
      explain: 'Paldea es la región de la novena generación.',
    },
    {
      q: '¿Qué objeto restaura todos los PS y cura los problemas de estado?',
      correct: 'Restaurar Todo',
      wrong: ['Poción', 'Antídoto', 'Revivir'],
      explain: 'Restaurar Todo cura por completo los PS y los problemas de estado.',
    },
    {
      q: '¿En qué región aparece el fenómeno Dinamax?',
      correct: 'Galar',
      wrong: ['Alola', 'Kalos', 'Johto'],
      explain: 'El Dinamax y el Gigamax son propios de Galar (Espada y Escudo).',
    },
    {
      q: '¿Qué Pokémon acompaña a Jessie y James y puede hablar?',
      correct: 'Meowth',
      wrong: ['Wobbuffet', 'Ekans', 'Koffing'],
      explain: 'Meowth aprendió a hablar el idioma humano.',
    },
    {
      q: '¿Qué objeto debe llevar Onix al ser intercambiado para evolucionar a Steelix?',
      correct: 'Revestimiento Metálico',
      wrong: ['Escama Dragón', 'Roca del Rey', 'Mejora'],
      explain: 'Onix evoluciona a Steelix si se intercambia con Revestimiento Metálico.',
    },
    {
      q: '¿Qué Pokémon legendario aparece en la portada de Pokémon Plata?',
      correct: 'Lugia',
      wrong: ['Ho-Oh', 'Suicune', 'Celebi'],
      explain: 'Lugia aparece en Plata; Ho-Oh en Oro.',
    },
    {
      q: '¿De qué tipo son los Pokémon de Brock, el líder de Ciudad Plateada?',
      correct: 'Roca',
      wrong: ['Agua', 'Lucha', 'Tierra'],
      explain: 'Brock es el líder de gimnasio de tipo Roca.',
    },
  ],

  // ── LIGA: líderes de gimnasio, Alto Mando, campeones, medallas, legendarios y míticos ──
  liga: [
    {
      q: '¿Qué medalla entrega Misty en el gimnasio de Ciudad Celeste?',
      correct: 'Medalla Cascada',
      wrong: ['Medalla Roca', 'Medalla Trueno', 'Medalla Alma'],
      explain: 'Misty, líder de tipo Agua, entrega la Medalla Cascada.',
    },
    {
      q: '¿Quién es el líder del gimnasio de Ciudad Carmín?',
      correct: 'Teniente Surge',
      wrong: ['Koga', 'Blaine', 'Erika'],
      explain: 'El Teniente Surge usa Pokémon de tipo Eléctrico y entrega la Medalla Trueno.',
    },
    {
      q: '¿De qué tipo son los Pokémon de Erika, líder de Ciudad Azulona?',
      correct: 'Planta',
      wrong: ['Hada', 'Bicho', 'Agua'],
      explain: 'Erika es la líder de tipo Planta y entrega la Medalla Arcoíris.',
    },
    {
      q: '¿Quién es el líder del último gimnasio de Kanto, en Ciudad Verde?',
      correct: 'Giovanni',
      wrong: ['Blaine', 'Sabrina', 'Lance'],
      explain: 'Giovanni, jefe del Team Rocket, es el líder de tipo Tierra y entrega la Medalla Tierra.',
    },
    {
      q: '¿Qué medalla entrega Sabrina en Ciudad Azafrán?',
      correct: 'Medalla Pantano',
      wrong: ['Medalla Alma', 'Medalla Volcán', 'Medalla Tierra'],
      explain: 'Sabrina, líder de tipo Psíquico, entrega la Medalla Pantano.',
    },
    {
      q: '¿De qué tipo son los Pokémon de Koga, líder de Ciudad Fucsia?',
      correct: 'Veneno',
      wrong: ['Siniestro', 'Lucha', 'Bicho'],
      explain: 'Koga, el ninja, usa Pokémon de tipo Veneno y entrega la Medalla Alma.',
    },
    {
      q: '¿Dónde está el gimnasio de Blaine?',
      correct: 'Isla Canela',
      wrong: ['Islas Espuma', 'Isla Prima', 'Islas Remolino'],
      explain: 'Blaine, el líder de tipo Fuego, espera en Isla Canela con la Medalla Volcán.',
    },
    {
      q: '¿Cuántas medallas de gimnasio hacen falta para entrar a la Liga Pokémon?',
      correct: '8',
      wrong: ['6', '10', '4'],
      explain: 'En los juegos principales hacen falta las 8 medallas de la región.',
    },
    {
      q: '¿Qué miembro del Alto Mando de Kanto usa Pokémon de tipo Fantasma?',
      correct: 'Agatha',
      wrong: ['Lorelei', 'Bruno', 'Lance'],
      explain: 'Agatha es la experta en Fantasma; Lorelei usa Hielo, Bruno Lucha y Lance Dragón.',
    },
    {
      q: '¿De qué tipo son los Pokémon favoritos de Lance?',
      correct: 'Dragón',
      wrong: ['Volador', 'Agua', 'Fuego'],
      explain: 'Lance es el Maestro de los Dragones del Alto Mando de Kanto.',
    },
    {
      q: 'En Pokémon Rojo y Azul, ¿quién es el Campeón que espera tras el Alto Mando?',
      correct: 'Tu rival, Azul',
      wrong: ['Lance', 'Giovanni', 'El Profesor Oak'],
      explain: 'El rival llega antes a la cima y se convierte en Campeón de la Liga.',
    },
    {
      q: '¿Quién es la Campeona de la Liga de Sinnoh?',
      correct: 'Cintia',
      wrong: ['Máximo', 'Mirto', 'Dianta'],
      explain: 'Cintia es la Campeona de Sinnoh y su Pokémon estrella es Garchomp.',
    },
    {
      q: '¿Quién es el Campeón de la Liga en Pokémon Rubí y Zafiro?',
      correct: 'Máximo',
      wrong: ['Plubio', 'Cintia', 'Lance'],
      explain: 'Máximo es el Campeón en Rubí y Zafiro; en Esmeralda el puesto lo ocupa Plubio.',
    },
    {
      q: '¿De qué tipo es el gimnasio de Morti en Ciudad Iris?',
      correct: 'Fantasma',
      wrong: ['Psíquico', 'Siniestro', 'Normal'],
      explain: 'Morti, líder de Ciudad Iris, usa Pokémon de tipo Fantasma.',
    },
    {
      q: '¿Qué Pokémon de Blanca, líder de Ciudad Trigal, es famoso por ser muy difícil de vencer?',
      correct: 'Miltank',
      wrong: ['Clefairy', 'Snorlax', 'Tauros'],
      explain: 'El Miltank de Blanca, con Desenrollar, es uno de los rivales más recordados de Johto.',
    },
    {
      q: '¿Cuál de estos Pokémon NO es uno de los tres pájaros legendarios de Kanto?',
      correct: 'Lugia',
      wrong: ['Articuno', 'Zapdos', 'Moltres'],
      explain: 'Los pájaros legendarios de Kanto son Articuno, Zapdos y Moltres; Lugia es de Johto.',
    },
    {
      q: '¿Qué Pokémon legendario de Sinnoh controla el tiempo?',
      correct: 'Dialga',
      wrong: ['Palkia', 'Giratina', 'Arceus'],
      explain: 'Dialga domina el tiempo, Palkia el espacio y Giratina habita el Mundo Distorsión.',
    },
    {
      q: '¿Qué Pokémon legendario habita el Mundo Distorsión?',
      correct: 'Giratina',
      wrong: ['Darkrai', 'Palkia', 'Deoxys'],
      explain: 'Giratina fue desterrado al Mundo Distorsión, el reverso del mundo normal.',
    },
    {
      q: '¿Qué Pokémon mítico despierta cada mil años y concede deseos?',
      correct: 'Jirachi',
      wrong: ['Celebi', 'Manaphy', 'Victini'],
      explain: 'Jirachi despierta solo siete días cada mil años y puede cumplir deseos.',
    },
    {
      q: '¿Qué Pokémon legendario baja del cielo para calmar el combate entre Kyogre y Groudon?',
      correct: 'Rayquaza',
      wrong: ['Latios', 'Jirachi', 'Deoxys'],
      explain: 'Rayquaza vive en la capa de ozono y detiene la pelea entre el mar y la tierra.',
    },
    {
      q: '¿Cuál de estos Pokémon es mítico (y no legendario)?',
      correct: 'Celebi',
      wrong: ['Suicune', 'Lugia', 'Zapdos'],
      explain: 'Celebi es un Pokémon mítico que viaja en el tiempo; los otros tres son legendarios.',
    },
    {
      q: '¿A partir del ADN de qué Pokémon fue creado Mewtwo en un laboratorio?',
      correct: 'Mew',
      wrong: ['Ditto', 'Arceus', 'Deoxys'],
      explain: 'Según los diarios de la Mansión Pokémon de Isla Canela, Mewtwo se creó a partir de Mew.',
    },
    {
      q: '¿Qué Pokémon devolvió la vida a Raikou, Entei y Suicune tras el incendio de la Torre Quemada?',
      correct: 'Ho-Oh',
      wrong: ['Lugia', 'Celebi', 'Moltres'],
      explain: 'Ho-Oh revivió a los tres Pokémon que murieron en el incendio de la Torre Quemada.',
    },
    {
      q: '¿Qué Pokémon es conocido como el creador del universo Pokémon?',
      correct: 'Arceus',
      wrong: ['Mew', 'Dialga', 'Giratina'],
      explain: 'Según la mitología de Sinnoh, Arceus dio forma al universo.',
    },
  ],
};
