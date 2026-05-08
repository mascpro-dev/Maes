
export interface StaticDevotional {
  day: number;
  date?: string;
  title: string;
  verse: string;
  reference: string;
  message: string;
  prayer: string;
}

// Base de devocionais estáticos - você pode expandir esta lista
const staticDevotionals: StaticDevotional[] = [
  {
    day: 1,
    title: "Novo Começo",
    verse: "Portanto, se alguém está em Cristo, é nova criação. As coisas antigas já passaram; eis que surgiram coisas novas!",
    reference: "2 Coríntios 5:17",
    message: "Cada novo dia é uma oportunidade de recomeçar com Deus. Ele nos oferece sua graça renovada a cada manhã, permitindo que deixemos para trás os erros do passado e caminhemos em direção ao futuro que Ele preparou para nós. Como mulheres virtuosas, podemos abraçar esta renovação diária, confiando que Deus está fazendo algo novo em nossas vidas.",
    prayer: "Senhor, obrigada por este novo dia e pela oportunidade de recomeçar contigo. Ajuda-me a deixar para trás aquilo que não serve mais e a abraçar as novidades que tens para mim. Que eu possa ser uma nova criação em Cristo hoje e sempre. Amém."
  },
  {
    day: 2,
    title: "Força Interior",
    verse: "Posso todas as coisas naquele que me fortalece.",
    reference: "Filipenses 4:13",
    message: "A verdadeira força não vem de nós mesmas, mas de Cristo que vive em nós. Quando enfrentamos desafios que parecem impossíveis, podemos lembrar que não estamos sozinhas. O poder de Deus opera através de nossa fraqueza, transformando-nos em mulheres capazes de superar qualquer obstáculo com fé e determinação.",
    prayer: "Pai celestial, quando me sentir fraca e incapaz, lembra-me de que minha força vem de ti. Que eu possa confiar em teu poder que opera em mim, sabendo que posso enfrentar qualquer situação com tua ajuda. Fortalece-me hoje, Senhor. Amém."
  },
  {
    day: 3,
    title: "Sabedoria Divina",
    verse: "Se algum de vocês tem falta de sabedoria, peça-a a Deus, que a todos dá livremente, de boa vontade; e lhe será concedida.",
    reference: "Tiago 1:5",
    message: "Em um mundo cheio de decisões complexas, precisamos da sabedoria que vem do alto. Deus promete nos dar sabedoria quando pedimos com fé. Como mulheres virtuosas, devemos buscar sempre a orientação divina antes de tomar decisões importantes, confiando que Ele nos guiará pelo melhor caminho.",
    prayer: "Senhor, peço-te sabedoria para as decisões que preciso tomar hoje. Que eu possa discernir tua vontade em cada situação e escolher sempre o caminho que te agrada. Obrigada por prometeres dar sabedoria a quem pede. Amém."
  },
  {
    day: 4,
    title: "Amor Incondicional",
    verse: "Nisto consiste o amor: não em que nós tenhamos amado a Deus, mas em que ele nos amou e enviou seu Filho como propiciação pelos nossos pecados.",
    reference: "1 João 4:10",
    message: "O amor de Deus por nós não depende de nossos méritos ou ações. Ele nos amou primeiro, incondicionalmente. Este amor deve ser a base de como amamos outros - nossa família, amigos e até mesmo aqueles que nos magoam. Quando amamos como Deus ama, refletimos sua natureza divina.",
    prayer: "Deus de amor, obrigada por me amares incondicionalmente. Ajuda-me a amar outros da mesma forma que tu me amas - sem condições, com paciência e bondade. Que teu amor flua através de mim para alcançar aqueles ao meu redor. Amém."
  },
  {
    day: 5,
    title: "Paz Interior",
    verse: "Deixo-lhes a paz; a minha paz lhes dou. Não a dou como o mundo a dá. Não se perturbe o seu coração, nem tenham medo.",
    reference: "João 14:27",
    message: "A paz que Jesus oferece é diferente da paz que o mundo promete. É uma paz que permanece mesmo em meio às tempestades da vida. Esta paz interior vem da certeza de que estamos nas mãos de Deus, independentemente das circunstâncias externas. Como mulheres de fé, podemos carregar esta paz conosco onde quer que vamos.",
    prayer: "Jesus, obrigada pela tua paz que supera todo entendimento. Nos momentos de ansiedade e preocupação, lembra-me de descansar em ti. Que tua paz encha meu coração e se manifeste através de mim para outros que precisam desta tranquilidade. Amém."
  },
  {
    day: 6,
    title: "Propósito Divino",
    verse: "Porque sou eu que conheço os planos que tenho para vocês', diz o Senhor, 'planos de fazê-los prosperar e não de causar dano, planos de dar-lhes esperança e um futuro.",
    reference: "Jeremias 29:11",
    message: "Cada uma de nós tem um propósito específico no plano de Deus. Mesmo quando não conseguimos ver o caminho claramente, podemos confiar que Deus está trabalhando todas as coisas para o nosso bem. Nosso papel é permanecer fiéis, buscando sua vontade e caminhando em obediência.",
    prayer: "Senhor, obrigada por teres planos maravilhosos para minha vida. Ajuda-me a confiar em ti mesmo quando não compreendo o caminho. Que eu possa caminhar em teu propósito, sendo usada por ti para fazer a diferença no mundo. Amém."
  },
  {
    day: 7,
    title: "Gratidão Constante",
    verse: "Deem graças em todas as circunstâncias, pois esta é a vontade de Deus para vocês em Cristo Jesus.",
    reference: "1 Tessalonicenses 5:18",
    message: "A gratidão não é apenas para os momentos bons - é um estilo de vida que devemos cultivar em todas as circunstâncias. Quando escolhemos ser gratas, nossa perspectiva muda e conseguimos ver a mão de Deus operando mesmo nas situações difíceis. A gratidão transforma nosso coração e nos aproxima de Deus.",
    prayer: "Pai, obrigada por todas as bênçãos em minha vida, tanto as que reconheço quanto as que ainda não percebi. Ajuda-me a manter um coração grato em todas as circunstâncias, reconhecendo tua bondade e fidelidade. Amém."
  },
  {
    day: 8,
    title: "Palavra Viva",
    verse: "Lâmpada para os meus pés é a tua palavra e luz para os meus caminhos.",
    reference: "Salmos 119:105",
    message: "A Palavra de Deus é nossa bússola na jornada da vida. Ela ilumina nossos passos quando o caminho parece escuro e nos orienta nas decisões diárias. Quando nos alimentamos regularmente da Palavra, desenvolvemos sabedoria e discernimento para viver de acordo com a vontade de Deus.",
    prayer: "Senhor, obrigada por tua Palavra que me guia e ensina. Ajuda-me a meditar em tua lei dia e noite, que ela possa moldar meu caráter e dirigir meus passos. Que eu possa ser uma mulher da Palavra. Amém."
  },
  {
    day: 9,
    title: "Fé Inabalável",
    verse: "Ora, a fé é a certeza daquilo que esperamos e a prova das coisas que não vemos.",
    reference: "Hebreus 11:1",
    message: "A fé é o fundamento da vida cristã. Ela nos permite confiar em Deus mesmo quando não podemos ver o resultado final. Como mulheres de fé, somos chamadas a viver baseadas nas promessas de Deus, não nas circunstâncias visíveis. Nossa fé é a ponte entre onde estamos e onde Deus quer nos levar.",
    prayer: "Deus fiel, aumenta minha fé. Nos momentos de dúvida, lembra-me de tuas promessas e de tua fidelidade. Que eu possa viver pela fé e não pelo que vejo, confiando sempre em teu amor e cuidado. Amém."
  },
  {
    day: 10,
    title: "Perdão Libertador",
    verse: "Sejam bondosos e compassivos uns para com os outros, perdoando-se mutuamente, assim como Deus os perdoou em Cristo.",
    reference: "Efésios 4:32",
    message: "O perdão é uma das maiores demonstrações de força e maturidade espiritual. Quando perdoamos, não estamos desculpando o erro do outro, mas libertando nosso próprio coração do peso da amargura. O perdão nos liberta para viver em paz e nos aproxima do coração de Deus.",
    prayer: "Senhor, assim como tu me perdoaste, ajuda-me a perdoar aqueles que me machucaram. Liberta meu coração de qualquer amargura ou ressentimento. Que eu possa ser um instrumento de reconciliação e amor. Amém."
  },
  {
    day: 11,
    title: "Esperança Renovada",
    verse: "Mas os que esperam no Senhor renovam as suas forças, voam alto como águias; correm e não se cansam, andam e não se fatigam.",
    reference: "Isaías 40:31",
    message: "Quando nossa esperança está depositada em Deus, encontramos forças para continuar mesmo nos momentos mais difíceis. A esperança cristã não é apenas otimismo - é a certeza de que Deus está no controle e que Seus planos para nós são bons. Esta esperança nos sustenta e nos renova diariamente.",
    prayer: "Senhor, quando me sentir cansada e desanimada, renova minhas forças. Que minha esperança esteja sempre firmada em ti e em tuas promessas. Ajuda-me a voar alto como as águias, confiando em teu cuidado. Amém."
  },
  {
    day: 12,
    title: "Alegria Verdadeira",
    verse: "A alegria do Senhor é a nossa força.",
    reference: "Neemias 8:10",
    message: "A alegria cristã não depende das circunstâncias externas, mas da nossa relação com Deus. É uma alegria profunda que brota da certeza de que somos amadas e cuidadas por Ele. Esta alegria se torna nossa força nos dias difíceis e nossa luz nos momentos de escuridão.",
    prayer: "Deus de alegria, obrigada por encheres meu coração com tua alegria. Nos dias difíceis, lembra-me de que minha alegria vem de ti. Que esta alegria seja minha força e que eu possa compartilhá-la com outros. Amém."
  },
  {
    day: 13,
    title: "Confiança Plena",
    verse: "Confie no Senhor de todo o seu coração e não se apoie em seu próprio entendimento.",
    reference: "Provérbios 3:5",
    message: "Confiar em Deus significa abandonar nossa necessidade de controlar tudo e entender cada detalhe. É um ato de humildade que reconhece que a sabedoria de Deus é infinitamente superior à nossa. Quando confiamos plenamente nEle, encontramos paz e direção para nossa vida.",
    prayer: "Senhor, ajuda-me a confiar em ti de todo meu coração. Quando minha mente quiser entender tudo, lembra-me de que teus caminhos são mais altos que os meus. Que eu possa descansar na tua sabedoria e cuidado. Amém."
  },
  {
    day: 14,
    title: "Amor ao Próximo",
    verse: "Um novo mandamento lhes dou: amem-se uns aos outros. Como eu os amei, vocês devem amar-se uns aos outros.",
    reference: "João 13:34",
    message: "O amor é a marca distintiva dos seguidores de Cristo. Não é um sentimento que vem e vai, mas uma escolha diária de buscar o bem do outro. Como mulheres virtuosas, somos chamadas a amar como Jesus amou - com sacrifício, paciência e bondade.",
    prayer: "Jesus, obrigada por me amares primeiro. Ajuda-me a amar outros com o mesmo amor que recebi de ti. Que meu amor seja genuíno, paciente e bondoso, refletindo teu caráter em minha vida. Amém."
  },
  {
    day: 15,
    title: "Crescimento Contínuo",
    verse: "Antes, cresçam na graça e no conhecimento de nosso Senhor e Salvador Jesus Cristo.",
    reference: "2 Pedro 3:18",
    message: "A vida cristã é uma jornada de crescimento constante. Cada dia oferece oportunidades para conhecer melhor a Deus e desenvolver nosso caráter cristão. O crescimento na graça nos torna mais parecidas com Jesus, enquanto o crescimento no conhecimento nos fortalece na fé.",
    prayer: "Senhor, que eu possa crescer a cada dia na tua graça e conhecimento. Molda meu caráter para ser mais parecido contigo. Ajuda-me a não ficar estagnada, mas a buscar sempre crescer em minha fé. Amém."
  }
];

export class DevotionalService {
  private static devotionals = staticDevotionals;

  static getDayOfYear(date: Date = new Date()): number {
    const start = new Date(date.getFullYear(), 0, 0);
    const diff = date.getTime() - start.getTime();
    const oneDay = 1000 * 60 * 60 * 24;
    return Math.floor(diff / oneDay);
  }

  static getTodayDevotional(): StaticDevotional | null {
    const dayOfYear = this.getDayOfYear();
    // Se não temos devocional para o dia específico, usar um padrão baseado no módulo
    const devotionalIndex = (dayOfYear - 1) % this.devotionals.length;
    return this.devotionals[devotionalIndex] || null;
  }

  static getDevotionalByDay(day: number): StaticDevotional | null {
    const devotionalIndex = (day - 1) % this.devotionals.length;
    return this.devotionals[devotionalIndex] || null;
  }

  static getAllDevotionals(): StaticDevotional[] {
    return this.devotionals;
  }

  static getTotalDevotionals(): number {
    return this.devotionals.length;
  }

  // Método para adicionar mais devocionais futuramente
  static addDevotional(devotional: StaticDevotional): void {
    this.devotionals.push(devotional);
  }

  // Método para atualizar um devocional existente
  static updateDevotional(day: number, devotional: Partial<StaticDevotional>): boolean {
    const index = this.devotionals.findIndex(d => d.day === day);
    if (index !== -1) {
      this.devotionals[index] = { ...this.devotionals[index], ...devotional };
      return true;
    }
    return false;
  }
}
