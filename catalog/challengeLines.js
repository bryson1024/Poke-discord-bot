// ==========================================================
// catalog/challengeLines.js — what the Elite Four, Blue and Red say when
// the player's Team has a mythic (full sim only, decided 2026-11-14). The
// line shows under the fight's heading (utils/battle/playback.js
// challengeHeader) and names one mythic on the Team, drawn from the fight's
// seed (utils/challenge/runChallenge.js), so each fight can name a different
// one and a replay names the same one. Each speaker has their own line for
// every mythic-tier species. Their stat boost rises with each mythic
// (utils/battle/tuning.js FULL_SIM.mythicStatBoost), but they always fight
// to win, so no line hints they'd try less without one.
// Red never talks: his silence just runs longer, up to 3 mythics.
// ==========================================================

import { FULL_SIM } from "../utils/battle/tuning.js";
import { CHALLENGES } from "../utils/challenge/roster.js";

const SPEAKERS = ["lorelei", "bruno", "agatha", "lance", "blue"];

// speciesId: [Lorelei, Bruno, Agatha, Lance, Blue]
const LINES = {
  150: [ // Mewtwo
    "Mewtwo was made in a lab for battle. I wonder if it has ever felt real cold.",
    "Mewtwo! Built in a lab to be the strongest. My team got strong the hard way!",
    "Mewtwo. Made by people who should have known better, and now it's in my hall.",
    "Mewtwo came from science, not legend. Its strength is real all the same.",
    "Mewtwo? From Cerulean Cave? Gramps is going to hear about this.",
  ],
  151: [ // Mew
    "I believed Mew was a story for children. Let's see if the story can take the cold.",
    "Mew! So small, and it knows every move there is. Show me!",
    "Oak spent years chasing Mew. Wait till he hears a child found it. Ha!",
    "Every Pokémon descends from Mew, dragons too. I'm honored to face it.",
    "You found Mew? It's tiny! No way it's tougher than my team.",
  ],
  249: [ // Lugia
    "Lugia lives in the deep sea. Cold water should feel like home to it.",
    "Lugia! One beat of those wings can raise a storm. We'll stand firm!",
    "Lugia hides at the bottom of the sea for a reason. Let's find out what it is.",
    "Lugia sleeps in the deep so its power hurts no one. Show me you've earned its trust.",
    "Lugia? Huh. Must've taken you forever to find that thing.",
  ],
  250: [ // Ho-Oh
    "Ho-Oh's flames rise with the dawn. My ice has melted before. It never stayed melted.",
    "Ho-Oh! A rainbow of fire! My team loves the heat!",
    "Ho-Oh brought three Pokémon back from the ashes. I know a thing or two about the dead myself.",
    "Ho-Oh shows itself only to trainers with pure hearts. So it chose you.",
    "Ho-Oh? Pretty colors. Doesn't mean it can win.",
  ],
  251: [ // Celebi
    "Celebi travels through time. Let's see if it remembers this battle tomorrow.",
    "Celebi! It can cross time itself, but it can't skip this fight!",
    "If Celebi travels through time, maybe it can tell me how this ends.",
    "Forests flourish wherever Celebi goes. I'd like to see what it does in a battle.",
    "A Celebi? Did it bring you here from the future or something?",
  ],
  382: [ // Kyogre
    "Kyogre filled the oceans. Water freezes, though. Even that much water.",
    "Kyogre! A whole ocean of power! We'll ride out the storm!",
    "The rain never stops when Kyogre's around. My bones will feel it tomorrow.",
    "Kyogre once flooded the world fighting Groudon. Keep it close.",
    "Kyogre? You're gonna make it rain in here? Ugh.",
  ],
  383: [ // Groudon
    "Groudon raised whole continents. Let's see how its sunshine holds up in here.",
    "Groudon! Strength enough to lift the land! That's power I respect!",
    "Groudon brings drought. My old Pokémon don't care for it, but they'll manage.",
    "Groudon shaped the land itself. It needs a trainer who understands it.",
    "Groudon? Big deal. It's just a Ground type. I've got that covered.",
  ],
  384: [ // Rayquaza
    "Rayquaza comes from the ozone layer. It's colder up there than anywhere I've trained.",
    "Rayquaza! It calmed Kyogre and Groudon. That takes real strength. Let's test it!",
    "Rayquaza lived in the sky for ages, and you talked it into a Poké Ball? Hmph.",
    "Rayquaza, the dragon of the sky. I've dreamed of seeing one. Show me how you've raised it.",
    "Rayquaza? Where'd you even find it? Doesn't matter. I'm still the strongest trainer around!",
  ],
  385: [ // Jirachi
    "Jirachi wakes once every thousand years. Let's make this battle worth waking for.",
    "Jirachi! If I had one wish, it would be a good fight. Looks like I got it!",
    "Jirachi grants wishes, does it? I've got a few. Win first.",
    "Jirachi sleeps for a thousand years at a time. You must have been lucky.",
    "A Jirachi? Bet you wished for a win. Not happening.",
  ],
  386: [ // Deoxys
    "Deoxys came from space, the coldest place there is. It should feel at home here.",
    "Deoxys! It can change its form at will. My team has one form. Ready!",
    "Deoxys fell from the sky on a meteor. I've seen stranger things in Lavender Town.",
    "Deoxys was born from a virus in space. Even dragons have never seen its like.",
    "Deoxys? A space alien? Okay, that's kind of cool. I'm still winning.",
  ],
  483: [ // Dialga
    "Dialga rules over time. Ice can make time stand still too.",
    "Dialga! It can bend time, but every second of this battle will be a fight!",
    "Dialga, master of time. Could you send me back fifty years? My knees would thank you.",
    "Dialga, the dragon of time. Every dragon tamer dreams of facing it.",
    "Dialga? Time control? Doesn't matter how much time you get. You're not beating me.",
  ],
  484: [ // Palkia
    "Palkia rules over space. Space has room for plenty of ice.",
    "Palkia! It can tear space open! We won't give it an inch!",
    "Palkia holds the space between worlds. Mind it doesn't drag you into the wrong one.",
    "Palkia, the dragon of space. Few dragon tamers ever see one. I won't forget this.",
    "Palkia? Fancy. Still not as cool as my team.",
  ],
  487: [ // Giratina
    "Giratina... I've only read about it. Let's see how it handles the cold.",
    "Giratina! It came from another world, and it still has to get past my team!",
    "Giratina, from the world on the other side. My ghosts know it well. Even they fear its name.",
    "Giratina was banished to the Distortion World for its violence. A dragon like that needs a strong hand.",
    "Giratina? That thing looks creepy. Doesn't scare me.",
  ],
  489: [ // Phione
    "Phione drifts through the coldest seas. I like it already.",
    "Phione! Small, but a mythic all the same! Let's see what it's made of!",
    "Phione. Not quite Manaphy, but still more than Oak ever caught.",
    "Phione is born from Manaphy. Even the smallest legends carry great power.",
    "A Phione? Isn't that a mini Manaphy? Cute.",
  ],
  490: [ // Manaphy
    "Manaphy, prince of the sea. Royalty doesn't impress the cold.",
    "Manaphy! It can swap hearts with others. Mine belongs to training!",
    "Manaphy swaps hearts with people, I hear. Don't try that with mine. It's too old.",
    "Manaphy rides the warm currents of the world. Let's see how far it has come.",
    "Manaphy? It's so tiny. Is this a joke?",
  ],
  491: [ // Darkrai
    "Darkrai brings nightmares. Mine are usually about melting.",
    "Darkrai! Nightmares don't scare me! My team trains even in their sleep!",
    "Bad dreams are nothing new to me, child. Darkrai can join the rest of them.",
    "Darkrai traps others in nightmares to protect itself. Let's see it in the waking world.",
    "Darkrai? Bad dreams? The only nightmare here is you losing.",
  ],
  492: [ // Shaymin
    "Shaymin turns wastelands green. It won't find much to grow in here.",
    "Shaymin! A small hedgehog with a mighty spirit! I respect that!",
    "Flowers everywhere Shaymin goes. Flowers wilt, dearie.",
    "Flowers bloom wherever Shaymin goes. A gentle Pokémon, and a fighter all the same.",
    "A Shaymin? It's a hedgehog covered in flowers. Really?",
  ],
  493: [ // Arceus
    "Arceus shaped the universe. I've studied the old texts, but I never expected to face it.",
    "Arceus! It made everything, so it made my team too. Let's see who trained harder!",
    "Arceus made the whole world, and now it's battling an old woman in a stuffy room. Ha!",
    "Arceus came before even the greatest dragons. I'm humbled.",
    "Arceus?! No way. Gramps is going to lose his mind.",
  ],
  494: [ // Victini
    "Victini brings victory. Victory still has to get past the cold.",
    "Victini! It brings victory to its trainer. We'll see whose victory it brings!",
    "Victini is supposed to bring you luck. You'll need it.",
    "Victini shares its boundless energy with its trainer. Let's see what the two of you can do.",
    "Victini? The victory Pokémon? Ha! Bet it's never met me.",
  ],
  643: [ // Reshiram
    "Reshiram's fire could burn the world. My ice could freeze it.",
    "Reshiram, the dragon of truth! Here's the truth. We trained for this!",
    "Reshiram's flames are white. I've seen ghost fire burn hotter.",
    "Reshiram follows a hero who seeks the truth. Which are you?",
    "Reshiram? A white dragon? Okay, that's cool. Not cooler than me, though.",
  ],
  644: [ // Zekrom
    "Zekrom fights for ideals. Ideals freeze too.",
    "Zekrom, the dragon of ideals! My ideal is a hard fight, and here it is!",
    "Zekrom and all that lightning. Careful, my hair's frizzy enough.",
    "Zekrom sides with a hero chasing a dream. What's yours?",
    "Zekrom? A lightning dragon? My team eats lightning for breakfast.",
  ],
  646: [ // Kyurem
    "Kyurem! A dragon of ice. I've waited my whole career to see one. Let's find out which of us is colder.",
    "Kyurem! It freezes everything it touches! My team doesn't freeze. It fights!",
    "Kyurem, the empty one. Cold and hollow, like some old friends of mine.",
    "Kyurem was left hollow when Reshiram and Zekrom split from it. A tragic dragon, and a strong one.",
    "Kyurem? An ice dragon? Lorelei must have loved seeing that.",
  ],
  647: [ // Keldeo
    "Keldeo is a young sword of justice. Swords chill quickly in here.",
    "Keldeo! A fellow Fighting type! I can feel its spirit! Let's go!",
    "Keldeo, a colt with a sword. Youngsters always think they're heroes.",
    "Keldeo is young and still learning. Show me how much it has grown with you.",
    "Keldeo? It's basically a pony. Come on.",
  ],
  648: [ // Meloetta
    "Meloetta's song changes how it fights. I hope it likes a quiet, cold room.",
    "Meloetta! It turns from singer to dancer! Then let's dance!",
    "Meloetta has a pretty voice. Let's see if it can sing over my ghosts.",
    "Meloetta's melody moves everyone who hears it. Let it move this battle.",
    "Meloetta? A singing Pokémon? This isn't a talent show.",
  ],
  649: [ // Genesect
    "Genesect is a fossil rebuilt as a weapon. Even machines slow down in the cold.",
    "Genesect! Ancient, and rebuilt with steel! Strength is strength! Come on!",
    "Genesect was dug up and bolted together by fools. Some things should stay buried.",
    "Genesect was brought back after 300 million years and made into a weapon. It deserves better. Treat it well.",
    "Genesect? A robot bug with a cannon? Okay. I've beaten weirder.",
  ],
  716: [ // Xerneas
    "Xerneas gives life. The cold takes it away. Let's see which wins.",
    "Xerneas, the Pokémon of life! My team is full of it too!",
    "Xerneas shares eternal life. A bit late for me, dearie.",
    "Xerneas's antlers shine with the power of life. A beautiful Pokémon.",
    "Xerneas? A glowing deer? Fancy. Bet it can't hit hard.",
  ],
  717: [ // Yveltal
    "Yveltal drains the life from everything around it. The warmth too, I hope.",
    "Yveltal, the Pokémon of destruction! My team is built to endure!",
    "Yveltal. Now that's a Pokémon I understand. Death has always been good company.",
    "When Yveltal's life ends, it takes everything around it. A dangerous partner. Respect it.",
    "Yveltal? It looks pretty mean. Good. I like a challenge.",
  ],
  719: [ // Diancie
    "Diancie is a princess of diamonds. Diamonds and ice. We have a lot in common.",
    "Diancie! Hard as diamond! My team's fists are harder!",
    "Diancie is a shiny little thing. I've no use for jewels at my age.",
    "Diancie makes diamonds from thin air. A rare beauty, and harder than it looks.",
    "A Diancie? It's a walking jewel. Didn't know you liked sparkly stuff.",
  ],
  720: [ // Hoopa
    "Hoopa can pull anything through its rings. Bring me a blizzard, then.",
    "Hoopa! A trickster! Tricks won't move my team!",
    "Hoopa is a ghostly trickster. I've got some tricks of my own.",
    "Hoopa moves whole mountains through its rings. Mischievous, but mighty.",
    "Hoopa? The ring thing? Pull a win out of there, I dare you.",
  ],
  721: [ // Volcanion
    "Volcanion is fire and water at once. Steam freezes too, you know.",
    "Volcanion! Steam strong enough to level mountains! Let's feel that power!",
    "Volcanion hates people, I hear. Smart Pokémon.",
    "Volcanion distrusts people, yet it fights beside you. You must have earned that.",
    "Volcanion? A steam cannon? I've beaten bigger.",
  ],
  791: [ // Solgaleo
    "Solgaleo carries the sun. It will find no sun in this room.",
    "Solgaleo! A lion as bright as the sun! My team burns just as bright!",
    "Solgaleo is bright, isn't it? My eyes aren't what they used to be.",
    "Solgaleo came from another world, carrying the light of the sun. I've never seen anything like it.",
    "Solgaleo? A space lion? Fine. I'll take it down.",
  ],
  792: [ // Lunala
    "Lunala, the moon's own Pokémon. The moon is cold. We'll get along.",
    "Lunala! A Pokémon of the moon! My team trains day and night!",
    "Lunala, a ghost of the moon. Now that's a Pokémon after my own heart.",
    "Lunala swallows the light and opens doorways to other worlds. Few trainers ever see one.",
    "Lunala? A big moon bat? It doesn't scare me.",
  ],
  801: [ // Magearna
    "Magearna was built five hundred years ago and still runs. Cold is good for machines.",
    "Magearna! A machine with a soul! Then it knows what it means to fight!",
    "A person built Magearna five centuries ago. I'm old, but not that old.",
    "Magearna was built by human hands and given a heart. Proof that people and Pokémon can bond.",
    "Magearna? A robot? Huh. I thought those were only in movies.",
  ],
  802: [ // Marshadow
    "Marshadow hides in shadows. There are no shadows in fresh snow.",
    "Marshadow! It copies its foe's moves and makes them stronger! Copy my training, then!",
    "Marshadow lives in shadows and fights with its fists. My ghosts have envied it for years.",
    "Marshadow lurks in shadows. Few have ever seen it, and fewer have trained one.",
    "Marshadow? Never heard of it. Is it any good?",
  ],
  807: [ // Zeraora
    "Zeraora runs as fast as lightning. Ice is slippery, you know.",
    "Zeraora! Lightning-fast fists! My team can take a punch!",
    "Zeraora and all that speed. I gave up running years ago.",
    "Zeraora is as fast as lightning. Let's see if it can keep up with dragons.",
    "Zeraora? A lightning cat? I'm faster.",
  ],
  808: [ // Meltan
    "Meltan is a little nut of liquid metal. Liquid metal freezes nicely.",
    "Meltan! Small, but it eats metal! That's tough!",
    "Meltan? In my day, Pokémon weren't made of hardware.",
    "Meltan is small, but it gathers into something mighty. Every great Pokémon starts somewhere.",
    "A Meltan? It's a walking nut. You brought a nut.",
  ],
  809: [ // Melmetal
    "Melmetal is hundreds of Meltan fused into one. All that metal will get very cold.",
    "Melmetal! Those huge metal fists! A real heavyweight! I love it!",
    "Melmetal is heavy as a house. My floor creaks enough already.",
    "Melmetal makes iron from its own body. A Pokémon from the ancient world.",
    "Melmetal? It's all fists. My team's all brains. Let's go.",
  ],
  888: [ // Zacian
    "Zacian is the hero's sword. Blades go brittle in the cold.",
    "Zacian, the legendary sword! My team's will is sharper!",
    "Zacian is a dog with a sword in its mouth. In my day, dogs fetched sticks.",
    "Zacian saved a whole region. Let's see its blade.",
    "Zacian? A sword dog? Come on. That's just showing off.",
  ],
  889: [ // Zamazenta
    "Zamazenta is the hero's shield. Shields freeze to the touch.",
    "Zamazenta! A Fighting type with a shield! A true warrior! Let's see who stands taller!",
    "Zamazenta is a shield on legs. I've outlasted tougher shields.",
    "Zamazenta protects others, as a dragon tamer should.",
    "Zamazenta? Big shield. I'll break it.",
  ],
  890: [ // Eternatus
    "Eternatus came from a comet. The cold of space should feel familiar to it.",
    "Eternatus! Its power is enormous! Enormous power needs enormous training!",
    "Eternatus is poison and dragon, and older than anything here but me. Ha!",
    "Eternatus fell from the stars and nearly ended Galar. Now you hold it. Be careful.",
    "Eternatus? That thing's huge! How did you even catch it?",
  ],
  893: [ // Zarude
    "Zarude comes from the jungle. It won't like the cold.",
    "Zarude! Strong arms and vines! A brawler from the jungle! Good!",
    "Zarude is a rough-mannered thing, like most youngsters I meet.",
    "Zarude lives in packs deep in the jungle. Winning one's trust is no small feat.",
    "Zarude? A jungle monkey? You're full of surprises.",
  ],
  1007: [ // Koraidon
    "Koraidon comes from the ancient past. The ice ages were ancient too.",
    "Koraidon! A fighting dragon from the past! My team is ready for anything!",
    "Koraidon is ancient. So am I. Let's see who lasts.",
    "Koraidon is a dragon from long ago, with strength in every stride. A rare honor.",
    "Koraidon? A dinosaur dragon? Cool. Not cool enough.",
  ],
  1008: [ // Miraidon
    "Miraidon comes from the future. I wonder if the future is cold.",
    "Miraidon! An electric dragon from the future! The future has to get past my team!",
    "Miraidon, from the future? I won't be around to see it. Let's make the present count.",
    "Miraidon is a dragon of the future. I never thought I'd see one in my lifetime.",
    "Miraidon? It looks like a motorcycle. Did you ride it here?",
  ],
  1025: [ // Pecharunt
    "Pecharunt's peaches look sweet. I'd be careful eating anything it offers.",
    "Pecharunt! Small, but I hear its poison is fierce! We'll endure it!",
    "Pecharunt is poison and ghost, just like my favorites. I like you already, little one.",
    "Pecharunt controls others with its poison. Even dragons should be wary.",
    "Pecharunt? It's sitting in a peach. Is that supposed to scare me?",
  ],
};

const NAMES = Object.fromEntries(Object.values(CHALLENGES).flatMap((c) => c.opponents).map((o) => [o.key, o.name]));

/** mythics: { count, speciesId } from the fight. Null when this opponent has nothing to say. */
export function mythicLine(opponentKey, mythics) {
  if (!mythics?.count) return null;
  const said = opponentKey === "red"
    ? ".".repeat(3 * Math.min(mythics.count, FULL_SIM.mythicCap))
    : LINES[mythics.speciesId]?.[SPEAKERS.indexOf(opponentKey)];
  return said ? `**${NAMES[opponentKey]}:** "${said}"` : null;
}
