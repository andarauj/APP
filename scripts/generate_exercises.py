#!/usr/bin/env python3
"""Generate 500+ exercise seed data for GymForge."""
import json

# Base exercises: (name, primary_muscle, secondary_muscles, equipment, type, instructions)
# We'll define real exercises and then create variations to reach 500+

CHEST = [
    ("Supino com Barra", "chest", "triceps,shoulders", "barbell", "strength", "Deita-te no banco, pega na barra com as maos um pouco mais largas que os ombros. Baixa a barra controladamente ate ao peito e empurra para cima."),
    ("Supino Inclinado com Barra", "chest", "triceps,shoulders", "barbell", "strength", "Banco inclinado a 30-45 graus. Baixa a barra ate a parte superior do peito e empurra para cima."),
    ("Supino Declinado com Barra", "chest", "triceps", "barbell", "strength", "Banco declinado. Baixa a barra ate a parte inferior do peito e empurra para cima."),
    ("Supino com Halteres", "chest", "triceps,shoulders", "dumbbell", "strength", "Deita-te no banco com um halter em cada mao. Baixa os halteres ate ao peito e empurra para cima."),
    ("Supino Inclinado com Halteres", "chest", "triceps,shoulders", "dumbbell", "strength", "Banco inclinado. Baixa os halteres ate a parte superior do peito e empurra para cima."),
    ("Supino Declinado com Halteres", "chest", "triceps", "dumbbell", "strength", "Banco declinado com halteres. Baixa ate a parte inferior do peito."),
    ("Flexoes", "chest", "triceps,shoulders,abs", "bodyweight", "strength", "Posicao de prancha com as maos um pouco mais largas que os ombros. Baixa o corpo ate o peito quase tocar o chao e sobe."),
    ("Flexoes Inclinadas", "chest", "triceps,shoulders", "bodyweight", "strength", "Maos num banco ou superficie elevada. Baixa o corpo e sobe. Mais facil que flexoes normais."),
    ("Flexoes Declinadas", "chest", "triceps,shoulders", "bodyweight", "strength", "Pes num banco elevado, maos no chao. Baixa o corpo e sobe. Mais dificil que flexoes normais."),
    ("Flexoes Diamante", "chest", "triceps", "bodyweight", "strength", "Maos juntas formando um diamante. Foca mais no triceps."),
    ("Flexoes Arqueiras", "chest", "triceps,shoulders", "bodyweight", "strength", "Posicao de flexao com as maos muito largas. Baixa para um lado de cada vez."),
    ("Crossover no Cabo", "chest", "shoulders", "cable", "strength", "Em pe entre duas polias altas. Puxa as cordas para baixo e para dentro ate as maos se cruzarem a frente do peito."),
    ("Crucifixo no Cabo Alto", "chest", "shoulders", "cable", "strength", "Deita-te no banco entre polias altas. Puxa os cabos para baixo ate as maos se encontrarem."),
    ("Crucifixo com Halteres", "chest", "shoulders", "dumbbell", "strength", "Deita-te no banco. Com bracos quase retos, abre os halteres para os lados e junta de volta."),
    ("Crucifixo Inclinado com Halteres", "chest", "shoulders", "dumbbell", "strength", "Banco inclinado. Abre os halteres para os lados com bracos quase retos."),
    ("Pullover com Halter", "chest", "back,lats", "dumbbell", "strength", "Deita-te no banco perpendicular. Segura um halter com as duas maos acima da cabeca e baixa-a para tras."),
    ("Supino na Maquina", "chest", "triceps,shoulders", "machine", "strength", "Sentado na maquina de supino. Empurra as almofadas para frente ate esticar os bracos."),
    ("Supino Inclinado na Maquina", "chest", "triceps,shoulders", "machine", "strength", "Maquina de supino inclinado. Empurra as almofadas para cima e frente."),
    ("Press de Peito no Cabo", "chest", "triceps,shoulders", "cable", "strength", "Em pe ou sentado, empurra as cordas das polias medianas para frente."),
    ("Flexoes com Pernas Elevadas", "chest", "triceps,shoulders", "bodyweight", "strength", "Pes elevados num banco, maos no chao. Flexao profunda focando peito superior."),
    ("Supino Apertado com Barra", "chest", "triceps", "barbell", "strength", "Supino com pegada mais estreita que os ombros. Foca mais no triceps e peito interno."),
    ("Crucifixo na Maquina (Peck Deck)", "chest", "shoulders", "machine", "strength", "Sentado na maquina peck deck. Junta os bracos a frente do peito."),
    ("Crucifixo Declinado com Cabo", "chest", "shoulders", "cable", "strength", "Deita-te no banco declinado entre polias baixas. Puxa os cabos para cima."),
    ("Supino com Kettlebell", "chest", "triceps,shoulders", "kettlebell", "strength", "Deita-te no banco. Segura um kettlebell com as duas maos e empurra como supino."),
    ("Flexoes Pliometricas", "chest", "triceps,shoulders", "bodyweight", "strength", "Flexao explosiva com as maos a sair do chao no ponto mais alto."),
    ("Press de Peito Isometrico", "chest", "triceps,shoulders", "plate", "strength", "Empurra um disco contra uma parede ou maquina mantendo tensao constante."),
]

BACK = [
    ("Levantamento Terra", "back", "hamstrings,glutes,forearms,traps", "barbell", "strength", "Em pe com a barra no chao a frente. Dobra os joelhos e ancas, pega na barra e levanta esticando o corpo."),
    ("Levantamento Terra Rumano", "back", "hamstrings,glutes", "barbell", "strength", "Em pe com a barra. Baixa a barra ate as canelas mantendo as pernas quase retas. Sobe contraindo os isquios."),
    ("Deadlift Sumo", "back", "glutes,quads,hamstrings", "barbell", "strength", "Pernas muito abertas, pes apontados para fora. Levanta a barra com as costas retas."),
    ("Puxada Frontal (Lat Pulldown)", "back", "biceps", "cable", "strength", "Sentado na maquina. Puxa a barra ate abaixo do queixo, contraindo as costas."),
    ("Puxada Pegada Inversa", "back", "biceps", "cable", "strength", "Puxada com as palmas voltadas para ti. Foca mais no biceps."),
    ("Puxada Pegada Neutra", "back", "biceps", "cable", "strength", "Puxada com pegada neutra (palmas frente a frente)."),
    ("Puxada Atras", "back", "biceps", "cable", "strength", "Puxa a barra ate atras do pescoco. Maior alongamento dos dorsais."),
    ("Remada Curvada com Barra", "back", "biceps,forearms", "barbell", "strength", "Inclina-te a frente com as costas retas. Puxa a barra ate ao umbigo."),
    ("Remada Curvada Pegada Inversa", "back", "biceps", "barbell", "strength", "Remada curvada com palmas voltadas para ti."),
    ("Remada com Halteres", "back", "biceps", "dumbbell", "strength", "Inclinado com um halter em cada mao. Puxa os halteres ate ao umbigo."),
    ("Remada Apoiada no Banco", "back", "biceps", "dumbbell", "strength", "Um joelho e uma mao apoiados no banco. Puxa o halter ate ao umbigo."),
    ("Remada na Maquina", "back", "biceps", "machine", "strength", "Sentado na maquina de remada. Puxa as almofadas ate ao torso."),
    ("Remada no Cabo Baixo", "back", "biceps", "cable", "strength", "Sentado no chao ou banco. Puxa a corda da polia baixa ate ao torso."),
    ("Remada com Barra T", "back", "biceps,forearms", "barbell", "strength", "Em pe sobre a barra T. Puxa ate ao peito."),
    ("Remada com Barra na Maquina T", "back", "biceps", "machine", "strength", "Maquina de remada T. Puxa as placas ate ao peito."),
    ("Pull-up (Flexoes de Bracos)", "back", "biceps,forearms", "bodyweight", "strength", "Pega na barra com pegada larga. Sobe ate o queixo passar a barra e baixa controlado."),
    ("Pull-up Pegada Inversa (Chin-up)", "back", "biceps", "bodyweight", "strength", "Pega na barra com palmas para ti. Sobe e baixa controlado."),
    ("Pull-up Pegada Neutra", "back", "biceps", "bodyweight", "strength", "Pega na barra com pegada neutra. Sobe e baixa."),
    ("Pull-up Largo", "back", "biceps", "bodyweight", "strength", "Pega muito larga. Maior foco nos dorsais."),
    ("Pull-up Assisted", "back", "biceps", "machine", "strength", "Maquina de pull-up assistida. Usa o contrapeso para ajudar."),
    ("Pulldown com Pulley", "back", "biceps", "cable", "strength", "Puxada na polia alta com varias pegadas."),
    ("Face Pull", "back", "shoulders,traps", "cable", "strength", "Puxa a corda da polia alta ate a cara, abrindo os bracos. Excelente para postura."),
    ("Shrug com Halteres", "traps", "forearms", "dumbbell", "strength", "Em pe com halteres. Encolhe os ombros para cima o maximo possivel."),
    ("Shrug com Barra", "traps", "forearms", "barbell", "strength", "Em pe com a barra a frente. Encolhe os ombros para cima."),
    ("Shrug na Maquina", "traps", "forearms", "machine", "strength", "Maquina de shrug. Encolhe os ombros para cima."),
    ("Shrug com Cabo", "traps", "forearms", "cable", "strength", "Cabo baixo. Encolhe os ombros para cima."),
    ("Hip Thrust com Barra", "glutes", "hamstrings,back", "barbell", "strength", "Costas apoiadas no banco. Barra sobre a anca. Sobe a anca ate alinhar com o corpo."),
    ("Hip Thrust com Halter", "glutes", "hamstrings", "dumbbell", "strength", "Costas no banco. Halter sobre a anca. Sobe a anca."),
    ("Glute Bridge", "glutes", "hamstrings", "bodyweight", "strength", "Deitado de costas. Sobe a anca contraindo os gluteos."),
    ("Glute Bridge com Barra", "glutes", "hamstrings", "barbell", "strength", "Glute bridge com barra sobre a anca."),
    ("Pull-up L-Sit", "back", "biceps,abs", "bodyweight", "strength", "Pull-up com as pernas esticadas a frente em L."),
    ("Inverted Row", "back", "biceps", "bodyweight", "strength", "Barra baixa. Debaixo dela, corpo inclinado. Puxa o peito ate a barra."),
    ("Snatch-Grip Deadlift", "back", "glutes,hamstrings", "barbell", "strength", "Deadlift com pegada muito larga (snatch). Mais foco nas costas."),
    ("Rack Pull", "back", "traps,forearms", "barbell", "strength", "Deadlift parcial com a barra em suportes. Foca mais nas costas altas."),
    ("Meadows Row", "back", "biceps,lats", "barbell", "strength", "Remada unilateral com barra presa numa ponta. Puxa de baixo para cima."),
    ("Pendlay Row", "back", "biceps", "barbell", "strength", "Remada curvada explosiva com a barra a tocar no chao entre reps."),
    ("Lat Pulldown Unilateral", "back", "biceps", "cable", "strength", "Puxada unilateral com uma mao. Maior alongamento do dorsal."),
    ("Straight Arm Pulldown", "back", "triceps", "cable", "strength", "Em pe. Puxa a barra da polia alta ate as coxas com bracos retos."),
    ("Hyperextensao", "back", "glutes,hamstrings", "machine", "strength", "Banco romano. Desce o torso e sobe contraindo as costas."),
    ("Superman", "back", "glutes", "bodyweight", "strength", "Deitado de barriga para baixo. Levanta bracos e pernas simultaneamente."),
    ("Good Morning", "back", "hamstrings,glutes", "barbell", "strength", "Barra nas costas. Inclina-te a frente mantendo as pernas quase retas."),
    ("Barbell Row com Apoio", "back", "biceps", "barbell", "strength", "Remada curvada com peito apoiado num banco. Isola as costas."),
]

SHOULDERS = [
    ("Press Militar com Barra", "shoulders", "triceps", "barbell", "strength", "Em pe. Barra a altura dos ombros. Empurra para cima ate esticar os bracos."),
    ("Press Militar Sentado", "shoulders", "triceps", "barbell", "strength", "Sentado no banco. Empurra a barra de cima dos ombros para cima."),
    ("Press com Halteres", "shoulders", "triceps", "dumbbell", "strength", "Sentado. Halteres a altura dos ombros. Empurra para cima."),
    ("Press Arnold", "shoulders", "triceps", "dumbbell", "strength", "Press com halteres rodando as palmas de frente para ti para cima durante o movimento."),
    ("Press no Cabo", "shoulders", "triceps", "cable", "strength", "Empurra as cordas das polias medianas para cima."),
    ("Press na Maquina", "shoulders", "triceps", "machine", "strength", "Maquina de press de ombros. Empurra para cima."),
    ("Elevacao Lateral com Halteres", "shoulders", "", "dumbbell", "strength", "Em pe. Sobe os halteres para os lados ate a altura dos ombros."),
    ("Elevacao Lateral no Cabo", "shoulders", "", "cable", "strength", "Puxa a corda da polia baixa para o lado."),
    ("Elevacao Frontal com Halteres", "shoulders", "", "dumbbell", "strength", "Sobe os halteres a frente ate a altura dos ombros."),
    ("Elevacao Frontal com Barra", "shoulders", "", "barbell", "strength", "Sobe a barra a frente ate a altura dos ombros."),
    ("Elevacao Frontal no Cabo", "shoulders", "", "cable", "strength", "Puxa a corda da polia baixa para a frente."),
    ("Elevacao Frontal com Disco", "shoulders", "", "plate", "strength", "Segura um disco com as duas maos. Sobe a frente ate a altura dos ombros."),
    ("Elevacoes Inclinadas com Halteres", "shoulders", "chest", "dumbbell", "strength", "Deitado num banco inclinado. Sobe os halteres para os lados."),
    ("Crucifixo Inverso com Halteres", "shoulders", "back,traps", "dumbbell", "strength", "Inclinado. Abre os halteres para os lados focando a parte posterior dos ombros."),
    ("Crucifixo Inverso na Maquina", "shoulders", "back", "machine", "strength", "Maquina peck deck inversa. Abre para tras focando ombro posterior."),
    ("Crucifixo Inverso no Cabo", "shoulders", "back", "cable", "strength", "Cruza os cabos das polias baixas abrindo para tras."),
    ("Face Pull no Cabo", "shoulders", "traps,back", "cable", "strength", "Puxa a corda da polia alta ate a face abrindo os bracos."),
    ("Press de Ombros no Smith", "shoulders", "triceps", "smith", "strength", "Press de ombros na maquina smith."),
    ("Elevacao Lateral Unilateral no Cabo", "shoulders", "", "cable", "strength", "Elevacao lateral com uma mao no cabo."),
    ("Elevacao Lateral com Kettlebell", "shoulders", "", "kettlebell", "strength", "Elevacao lateral segurando um kettlebell."),
    ("Pike Push-up", "shoulders", "triceps", "bodyweight", "strength", "Flexao em posicao de V invertido. Baixa a cabeca ate ao chao e empurra."),
    ("Handstand Push-up", "shoulders", "triceps", "bodyweight", "strength", "Em apoio de pinheiro. Baixa ate a cabeca tocar o chao e empurra."),
    ("Elevacao Frontal Unilateral", "shoulders", "", "dumbbell", "strength", "Elevacao frontal com um halter de cada vez."),
    ("Y-Raise", "shoulders", "traps", "cable", "strength", "Cruza os cabos formando um Y. Foco em rotadores e ombro."),
    ("Elevacoes Laterais com Elastico", "shoulders", "", "band", "strength", "Elevacao lateral usando elastico de resistencia."),
    ("Press de Ombros em Pe", "shoulders", "triceps,abs", "barbell", "strength", "Press militar em pe com barra. Estabiliza o core."),
    ("Bottoms Up Press", "shoulders", "forearms", "kettlebell", "strength", "Press com kettlebell virado ao contrario para estabilidade."),
]

BICEPS = [
    ("Curl com Halteres", "biceps", "forearms", "dumbbell", "strength", "Em pe. Sobe os halteres contraindo o biceps. Roda as palmas para cima durante o movimento."),
    ("Curl Alternado com Halteres", "biceps", "forearms", "dumbbell", "strength", "Curl com halteres alternando os bracos."),
    ("Curl com Barra", "biceps", "forearms", "barbell", "strength", "Em pe. Sobe a barra contraindo o biceps. Mantem os cotovelos fixos."),
    ("Curl com Barra EZ", "biceps", "forearms", "ez_bar", "strength", "Curl com barra EZ. Mais confortavel para os pulsos."),
    ("Curl Martelo com Halteres", "biceps", "forearms", "dumbbell", "strength", "Curl com pegada neutra. Foca no braquial e braquioradial."),
    ("Curl Martelo no Cabo", "biceps", "forearms", "cable", "strength", "Curl martelo usando a corda da polia baixa."),
    ("Curl Concentrado", "biceps", "", "dumbbell", "strength", "Sentado. Cotovelos apoiado na coxa. Curl unilateral com foco maximo no biceps."),
    ("Curl na Polia Baixa", "biceps", "forearms", "cable", "strength", "Curl com a corda da polia baixa."),
    ("Curl na Polia Alta", "biceps", "", "cable", "strength", "Curl com cabo da polia alta. Foca na porcao longa do biceps."),
    ("Preacher Curl com Barra", "biceps", "forearms", "barbell", "strength", "Curl no banco preacher. Isola o biceps impedindo usar o corpo."),
    ("Preacher Curl com Halter", "biceps", "", "dumbbell", "strength", "Curl unilateral no banco preacher."),
    ("Preacher Curl na Maquina", "biceps", "", "machine", "strength", "Maquina de preacher curl."),
    ("Curl 21s", "biceps", "forearms", "barbell", "strength", "7 reps na metade inferior, 7 na metade superior, 7 completas."),
    ("Curl com Barra Pegada Larga", "biceps", "", "barbell", "strength", "Curl com pegada mais larga que os ombros."),
    ("Curl com Barra Pegada Estreita", "biceps", "", "barbell", "strength", "Curl com pegada estreita. Foco na porcao longa."),
    ("Curl Inclinado com Halteres", "biceps", "", "dumbbell", "strength", "Sentado num banco inclinado. Curl com maior alongamento."),
    ("Curl de Cabo Cruzado", "biceps", "", "cable", "strength", "Cruzando os cabos das duas polias altas. Foco na porcao longa."),
    ("Curl Drag com Barra", "biceps", "back", "barbell", "strength", "Sobe a barra junto ao corpo levando os cotovelos para tras."),
    ("Curl Spider", "biceps", "", "dumbbell", "strength", "Deitado de barriga para baixo num banco inclinado. Curl deixando os bracos pendurar."),
    ("Curl Zottman", "biceps", "forearms", "dumbbell", "strength", "Curl normal na subida, roda as palmas para baixo na descida."),
    ("Curl com Elastico", "biceps", "", "band", "strength", "Curl usando elastico de resistencia."),
    ("Curl na Polia Baixa com Corda", "biceps", "forearms", "cable", "strength", "Curl com corda da polia baixa, pegada neutra."),
    ("Chin-up Foco Biceps", "biceps", "back", "bodyweight", "strength", "Chin-up com pegada inversa e foco na contracao do biceps."),
]

TRICEPS = [
    ("Extensao de Triceps na Polia", "triceps", "", "cable", "strength", "Em pe. Puxa a corda da polia alta para baixo ate esticar os bracos."),
    ("Extensao com Barra V", "triceps", "", "cable", "strength", "Extensao na polia alta com barra V."),
    ("Extensao com Barra Reta", "triceps", "", "cable", "strength", "Extensao na polia alta com barra reta."),
    ("Extensao Inversa na Polia", "triceps", "", "cable", "strength", "Polia alta, palmas para cima. Extensao focando a porcao longa."),
    ("Extensao por Cima com Corda", "triceps", "", "cable", "strength", "De costas para a polia. Puxa a corda por cima da cabeca."),
    ("Extensao com Halter por Cima", "triceps", "", "dumbbell", "strength", "Segura um halter com as duas maos. Sobe e baixa atras da cabeca."),
    ("Extensao com Halter Unilateral", "triceps", "", "dumbbell", "strength", "Extensao por cima da cabeca com um halter."),
    ("French Press com Barra EZ", "triceps", "", "ez_bar", "strength", "Deitado no banco. Baixa a barra ate a testa e estende de volta."),
    ("French Press com Halteres", "triceps", "", "dumbbell", "strength", "Deitado. Halteres atras da cabeca. Estende para cima."),
    ("Triceps Dips", "triceps", "chest,shoulders", "bodyweight", "strength", "Entre duas barras paralelas. Desce o corpo curvando os bracos e sobe."),
    ("Bench Dips", "triceps", "", "bodyweight", "strength", "Maos num banco atras de ti. Desce e sobe usando os triceps."),
    ("Supino Apertado", "triceps", "chest", "barbell", "strength", "Supino com pegada estreita. Maior foco no triceps."),
    ("Supino Apertado com Halteres", "triceps", "chest", "dumbbell", "strength", "Supino com halteres e pegada estreita."),
    ("Kickback de Triceps", "triceps", "", "dumbbell", "strength", "Inclinado. Cotovelos fixos. Estende os halteres para tras."),
    ("Extensao na Maquina", "triceps", "", "machine", "strength", "Maquina de extensao de triceps. Empurra para baixo."),
    ("Extensao no Banco", "triceps", "", "dumbbell", "strength", "Sentado no banco. Extensao por cima da cabeca."),
    ("Diamond Push-up", "triceps", "chest", "bodyweight", "strength", "Flexao com maos juntas em diamante. Foco no triceps."),
    ("Triceps no Cabo com Corda", "triceps", "", "cable", "strength", "Extensao na polia com corda. Abre a corda no final do movimento."),
    ("One-Arm Cable Extension", "triceps", "", "cable", "strength", "Extensao unilateral na polia alta."),
    ("JM Press", "triceps", "chest", "barbell", "strength", "Hibrido entre supino apertado e french press. Excelente para forca."),
    ("Tate Press", "triceps", "", "dumbbell", "strength", "Deitado no banco. Halteres virados para dentro. Abre para os lados ate aos cotovelos."),
    ("Skull Crusher com Cabo", "triceps", "", "cable", "strength", "French press usando o cabo da polia baixa."),
    ("Overhead Cable Extension", "triceps", "", "cable", "strength", "Extensao por cima da cabeca usando a polia baixa com corda."),
    ("Close-Grip Push-up", "triceps", "chest", "bodyweight", "strength", "Flexao com maos mais proximas. Foco triceps."),
]

LEGS_QUADS = [
    ("Agachamento com Barra", "quads", "glutes,hamstrings,abs", "barbell", "strength", "Barra nas costas. Desce ate as coxas ficarem paralelas ao chao. Sobe."),
    ("Agachamento Frontal", "quads", "glutes,abs", "barbell", "strength", "Barra a frente dos ombros. Desce e sobe. Mais foco nos quads."),
    ("Agachamento com Halteres", "quads", "glutes", "dumbbell", "strength", "Halteres nas maos. Agachamento ate as coxas ficarem paralelas."),
    ("Agachamento Goblet", "quads", "glutes,abs", "kettlebell", "strength", "Kettlebell ou halter a frente do peito. Agacha e sobe."),
    ("Agachamento Bulgariano", "quads", "glutes,hamstrings", "dumbbell", "strength", "Um pe apoiado num banco atras. Agacha com a outra perna."),
    ("Agachamento Sumo", "quads", "glutes", "barbell", "strength", "Pernas muito abertas, pes apontados para fora. Agacha e sobe."),
    ("Agachamento na Maquina (Hack)", "quads", "glutes", "machine", "strength", "Maquina hack squat. Ombros debaixo das almofadas. Desce e sobe."),
    ("Leg Press", "quads", "glutes,hamstrings", "machine", "strength", "Sentado na maquina. Empurra a plataforma com os pes."),
    ("Leg Press Unilateral", "quads", "glutes", "machine", "strength", "Leg press com uma perna de cada vez."),
    ("Extensao de Pernas (Leg Extension)", "quads", "", "machine", "strength", "Sentado na maquina. Estende as pernas contraindo os quads."),
    ("Extensao Unilateral de Pernas", "quads", "", "machine", "strength", "Extensao de pernas uma de cada vez."),
    ("Lunges com Halteres", "quads", "glutes,hamstrings", "dumbbell", "strength", "Da um passo a frente e baixa a anca ate o joelho quase tocar o chao. Alterna pernas."),
    ("Lunges com Barra", "quads", "glutes", "barbell", "strength", "Lunges com barra nas costas."),
    ("Lunges em Pe", "quads", "glutes", "bodyweight", "strength", "Lunges sem peso."),
    ("Lunges Laterais", "quads", "glutes", "dumbbell", "strength", "Da um passo lateral e baixa a anca. Alterna lados."),
    ("Lunges Reversos", "quads", "glutes,hamstrings", "dumbbell", "strength", "Da um passo para tras e baixa a anca."),
    ("Step-up com Halteres", "quads", "glutes", "dumbbell", "strength", "Sobe para um banco ou caixa com halteres. Alterna pernas."),
    ("Wall Sit", "quads", "glutes", "bodyweight", "strength", "Costas contra a parede, pernas a 90 graus. Mantem a posicao."),
    ("Sissy Squat", "quads", "", "bodyweight", "strength", "Em pe, inclina-te para tras ficando sobre os calcanhares. Foco maximo nos quads."),
    ("Pistol Squat", "quads", "glutes,abs", "bodyweight", "strength", "Agachamento unilateral com uma perna esticada a frente."),
    ("Cossack Squat", "quads", "glutes", "bodyweight", "strength", "Agacha para um lado mantendo a outra perna esticada. Alterna."),
    ("Front Squat com Halteres", "quads", "glutes", "dumbbell", "strength", "Agachamento frontal com halteres nos ombros."),
    ("Split Squat", "quads", "glutes", "dumbbell", "strength", "Posicao de lunge estatica. Agacha e sobe sem mover os pes."),
    ("Spanish Squat", "quads", "glutes", "band", "strength", "Elastico preso atras, agachamento isometrico na base."),
    ("Anderson Squat", "quads", "glutes", "barbell", "strength", "Agachamento comecando pela posicao mais baixa na rack."),
    ("Zercher Squat", "quads", "glutes,back", "barbell", "strength", "Barra nos cotovelos a frente do corpo. Agacha e sobe."),
]

LEGS_HAMS_GLUTES = [
    ("Cadeira Flexora (Leg Curl)", "hamstrings", "", "machine", "strength", "Sentado na maquina. Flexiona as pernas contraindo os isquios."),
    ("Cadeira Flexora Unilateral", "hamstrings", "", "machine", "strength", "Flexao de pernas uma de cada vez."),
    ("Leg Curl Deitado", "hamstrings", "", "machine", "strength", "Deitado na maquina. Flexiona as pernas."),
    ("Leg Curl em Pe", "hamstrings", "", "machine", "strength", "Em pe na maquina. Flexiona uma perna de cada vez."),
    ("Stiff com Halteres", "hamstrings", "glutes,back", "dumbbell", "strength", "Em pe com halteres. Baixa os halteres ate as canelas mantendo as pernas retas."),
    ("Stiff com Barra", "hamstrings", "glutes,back", "barbell", "strength", "Baixa a barra ate as canelas mantendo as costas retas e pernas quase esticadas."),
    ("Good Morning com Barra", "hamstrings", "glutes,back", "barbell", "strength", "Barra nas costas. Inclina-te a frente mantendo as pernas quase retas."),
    ("Nordic Curl", "hamstrings", "glutes", "bodyweight", "strength", "Joelhos no chao, pes presos. Desce o torso lentamente usando os isquios."),
    ("Glute Ham Raise", "hamstrings", "glutes,back", "machine", "strength", "Maquina GHR. Sobe o corpo contraindo isquios e gluteos."),
    ("Hip Thrust com Barra", "glutes", "hamstrings", "barbell", "strength", "Costas no banco. Barra sobre a anca. Sobe a anca contraindo gluteos."),
    ("Hip Thrust Unilateral", "glutes", "hamstrings", "dumbbell", "strength", "Hip thrust uma perna de cada vez."),
    ("Glute Bridge com Barra", "glutes", "hamstrings", "barbell", "strength", "Deitado. Barra sobre a anca. Sobe a anca."),
    ("Glute Bridge Unilateral", "glutes", "hamstrings", "bodyweight", "strength", "Glute bridge uma perna de cada vez."),
    ("Cable Pull-Through", "glutes", "hamstrings,back", "cable", "strength", "De costas para a polia baixa. Puxa a corda entre as pernas esticando a anca."),
    ("Kettlebell Swing", "glutes", "hamstrings,back", "kettlebell", "strength", "Balance o kettlebell entre as pernas usando a forca da anca."),
    ("Cable Kickback", "glutes", "", "cable", "strength", "Polia baixa. Chuta uma perna para tras contraindo o gluteo."),
    ("Donkey Kick", "glutes", "", "bodyweight", "strength", "Em quatro apoios. Chuta uma perna para cima."),
    ("Fire Hydrant", "glutes", "", "bodyweight", "strength", "Em quatro apoios. Abre uma perna para o lado."),
    ("Banded Hip Abduction", "glutes", "", "band", "strength", "Elastico nos joelhos. Abre as pernas para os lados."),
    ("Cable Hip Abduction", "glutes", "", "cable", "strength", "Polia baixa presa ao tornozelo. Abre a perna para o lado."),
    ("Curtsy Lunge", "glutes", "quads", "dumbbell", "strength", "Lunge cruzando uma perna atras da outra."),
    ("Step-up Lateral", "glutes", "quads", "dumbbell", "strength", "Sobe para um banco lateralmente."),
    ("Romanian Deadlift Unilateral", "hamstrings", "glutes,back", "dumbbell", "strength", "RDL numa perna so. Excelente para equilibrio e isquios."),
    ("B-Stiff RDL", "hamstrings", "glutes", "barbell", "strength", "RDL com uma perna ligeiramente elevada atras."),
    ("Reverse Hyper", "glutes", "hamstrings,back", "machine", "strength", "Maquina reverse hyper. Sobe as pernas contraindo os gluteos."),
    ("Belt Squat", "quads", "glutes,hamstrings", "machine", "strength", "Peso preso na anca. Agacha sem carregar as costas."),
]

CALVES = [
    ("Elevacao de Panturrilhas em Pe", "calves", "", "machine", "strength", "Em pe na maquina. Sobe nos bicos dos pes e baixa controlado."),
    ("Elevacao de Panturrilhas com Halteres", "calves", "", "dumbbell", "strength", "Em pe com halteres. Sobe nos bicos dos pes."),
    ("Elevacao de Panturrilhas com Barra", "calves", "", "barbell", "strength", "Barra nas costas. Sobe nos bicos dos pes."),
    ("Elevacao de Panturrilhas Sentado", "calves", "", "machine", "strength", "Sentado na maquina. Sobe os bicos dos pes."),
    ("Elevacao de Panturrilhas no Leg Press", "calves", "", "machine", "strength", "Leg press. Empurra a plataforma com os bicos dos pes."),
    ("Elevacao de Panturrilhas Unilateral", "calves", "", "dumbbell", "strength", "Elevacao de panturrilhas uma perna de cada vez."),
    ("Elevacao de Panturrilhas no Cabo", "calves", "", "cable", "strength", "Cabo baixo. Sobe nos bicos dos pes."),
    ("Donkey Calf Raise", "calves", "", "bodyweight", "strength", "Inclinado com costas horizontal. Sobe nos bicos dos pes."),
    ("Elevacao de Panturrilhas na Escada", "calves", "", "bodyweight", "strength", "Na borda de um degrau. Sobe e baixa nos bicos dos pes."),
    ("Tibialis Raise", "calves", "", "bodyweight", "strength", "Sentado com pes no ar. Sobe os pes contraindo a tibial."),
]

ABS = [
    ("Crunch", "abs", "", "bodyweight", "strength", "Deitado de costas. Sobe o tronco contraindo os abdominais."),
    ("Crunch Inclinado", "abs", "", "bodyweight", "strength", "Banco declinado. Sobe o tronco contra a gravidade."),
    ("Crunch no Cabo", "abs", "", "cable", "strength", "De joelhos. Puxa a corda da polia alta contraindo os abs."),
    ("Crunch na Maquina", "abs", "", "machine", "strength", "Maquina de crunch. Flexiona o tronco contraindo os abs."),
    ("Prancha (Plank)", "abs", "", "bodyweight", "strength", "Posicao de prancha nos antibracos. Mantem o corpo alinhado."),
    ("Prancha Lateral", "abs", "", "bodyweight", "strength", "De lado, apoia-te num antibraco. Mantem a posicao."),
    ("Leg Raise", "abs", "", "bodyweight", "strength", "Deitado. Sobe as pernas contraindo os abs inferiores."),
    ("Hanging Leg Raise", "abs", "forearms", "bodyweight", "strength", "Suspenso numa barra. Sobe as pernas ate 90 graus."),
    ("Hanging Knee Raise", "abs", "forearms", "bodyweight", "strength", "Suspenso. Sobe os joelhos ate ao peito."),
    ("Toes to Bar", "abs", "forearms", "bodyweight", "strength", "Suspenso. Sobe os pes ate tocar a barra."),
    ("Russian Twist", "abs", "", "bodyweight", "strength", "Sentado com pernas elevadas. Rota o torso de um lado para o outro."),
    ("Russian Twist com Peso", "abs", "", "plate", "strength", "Russian twist segurando um disco ou halter."),
    ("Bicycle Crunch", "abs", "", "bodybody", "strength", "Deitado. Move as pernas como se pedala, tocando cotovelos nos joelhos opostos."),
    ("Mountain Climbers", "abs", "shoulders", "bodyweight", "strength", "Posicao de prancha. Alterna os joelhos ate ao peito rapidamente."),
    ("V-Ups", "abs", "", "bodyweight", "strength", "Deitado. Sobe pernas e tronco simultaneamente formando um V."),
    ("Decline Reverse Crunch", "abs", "", "bodyweight", "strength", "Banco declinado. Sobe as pernas em direcao ao peito."),
    ("Ab Wheel Rollout", "abs", "shoulders,back", "other", "strength", "De joelhos. Roda a roda para a frente esticando o corpo e volta."),
    ("Hollow Body Hold", "abs", "", "bodyweight", "strength", "Deitado. Curva o corpo em forma de concha e mantem."),
    ("L-Sit", "abs", "triceps", "bodyweight", "strength", "Sentado com pernas esticadas a frente. Eleva o corpo com as maos."),
    ("Dragon Flag", "abs", "back,shoulders", "bodyweight", "strength", "Deitado num banco. Sobe o corpo todo como uma bandeira."),
    ("Cable Woodchopper", "abs", "shoulders", "cable", "strength", "Polia alta. Rota o torso puxando a corda de cima para baixo."),
    ("Pallof Press", "abs", "shoulders", "cable", "strength", "Polia media. Empurra a corda a frente resistindo a rotacao."),
    ("Dead Bug", "abs", "", "bodyweight", "strength", "Deitado. Alterna esticar braco e perna opostos mantendo o core contraido."),
    ("Bird Dog", "abs", "back", "bodyweight", "strength", "Em quatro apoios. Estica braco e perna opostos. Alterna."),
    ("Flutter Kicks", "abs", "", "bodyweight", "strength", "Deitado. Move as pernas para cima e para baixo alternadamente."),
    ("Scissor Kicks", "abs", "", "bodyweight", "strength", "Deitado. Cruza as pernas alternadamente no ar."),
    ("Side Bend com Halter", "abs", "", "dumbbell", "strength", "Em pe com halter numa mao. Inclina para o lado do halter."),
    ("Side Bend com Cabo", "abs", "", "cable", "strength", "Cabo baixo. Inclina para o lado puxando o cabo."),
    ("Cable Crunch Lateral", "abs", "", "cable", "strength", "Polia alta. Crunch lateral puxando a corda."),
    ("Standing Cable Crunch", "abs", "", "cable", "strength", "Em pe. Polia alta. Crunch levando a corda ate aos joelhos."),
]

FOREARMS = [
    ("Wrist Curl com Halter", "forearms", "", "dumbbell", "strength", "Sentado. Antibracos nas coxas. Sobe e baixa os pulsos."),
    ("Wrist Curl com Barra", "forearms", "", "barbell", "strength", "Antibracos no banco. Sobe os pulsos contraindo os antibracos."),
    ("Reverse Curl com Barra", "forearms", "biceps", "barbell", "strength", "Curl com palmas para baixo. Foca antibracos."),
    ("Reverse Curl com Halteres", "forearms", "biceps", "dumbbell", "strength", "Curl com palmas para baixo usando halteres."),
    ("Reverse Curl com Barra EZ", "forearms", "biceps", "ez_bar", "strength", "Reverse curl com barra EZ."),
    ("Farmer's Walk", "forearms", "traps", "dumbbell", "strength", "Segura halteres pesados e caminha mantendo a pegada."),
    ("Dead Hang", "forearms", "back", "bodyweight", "strength", "Suspenso numa barra. Mantem o maximo de tempo possivel."),
    ("Wrist Extension com Halter", "forearms", "", "dumbbell", "strength", "Antibracos no banco. Sobe os pulsos para cima (palmas para baixo)."),
    ("Plate Pinch", "forearms", "", "plate", "strength", "Segura dois discos juntos com os dedos. Mantem."),
    ("Towel Pull-up", "forearms", "back", "bodyweight", "strength", "Pull-up com toalha sobre a barra. Excelente para pegada."),
    ("Behind the Back Wrist Curl", "forearms", "", "barbell", "strength", "Barra atras das costas. Sobe os pulsos contraindo os antibracos."),
    ("Zottman Curl", "forearms", "biceps", "dumbbell", "strength", "Curl normal na subida, palmas para baixo na descida."),
]

CARDIO = [
    ("Corrida na Esteira", "cardio", "fullbody", "machine", "cardio", "Corre na esteira ajustando velocidade e inclinacao."),
    ("Caminhada na Esteira", "cardio", "", "machine", "cardio", "Caminha na esteira em ritmo moderado."),
    ("Remo Indoor (Ergometro)", "cardio", "back,legs", "machine", "cardio", "Maquina de remo. Puxa extendendo pernas, tronco e bracos."),
    ("Bicicleta Estacionaria", "cardio", "quads", "machine", "cardio", "Pedala na bicicleta ajustando resistencia."),
    ("Elliptical", "cardio", "fullbody", "machine", "cardio", "Maquina eliptica. Movimento combinado de bracos e pernas."),
    ("Stair Climber", "cardio", "quads,glutes", "machine", "cardio", "Maquina de escadas. Sobe degraus continuamente."),
    ("Jumping Jacks", "cardio", "fullbody", "bodyweight", "cardio", "Em pe. Salta abrindo pernas e bracos e volta."),
    ("Burpees", "cardio", "fullbody", "bodyweight", "cardio", "Agacha, poe as maos no chao, salta para prancha, volta, salta para cima."),
    ("Mountain Climbers Cardio", "cardio", "abs", "bodyweight", "cardio", "Prancha. Alterna joelhos ao peito rapidamente."),
    ("High Knees", "cardio", "quads,abs", "bodyweight", "cardio", "Em pe. Corre no sitio levando os joelhos ate a altura da anca."),
    ("Jump Rope", "cardio", "calves", "other", "cardio", "Salta a corda continuamente. Excelente cardio."),
    ("Sprint Intervals", "cardio", "quads,glutes", "bodyweight", "cardio", "Corre em alta intensidade por curtos periodos com descanso."),
    ("Box Jumps", "cardio", "quads,glutes", "other", "cardio", "Salta para cima de uma caixa. Desce e repete."),
    ("Battle Ropes", "cardio", "shoulders,back", "other", "cardio", "Ondula cordas pesadas rapidamente com os bracos."),
    ("Sled Push", "cardio", "quads,glutes", "other", "cardio", "Empurra um sledd carregado numa superficie."),
    ("Sled Pull", "cardio", "back,biceps", "other", "cardio", "Puxa um sledd usando corda ou cinto."),
    ("Kettlebell Swing Cardio", "cardio", "glutes,hamstrings", "kettlebell", "cardio", "Swings rapidos com kettlebell para cardio."),
    ("Step Mill", "cardio", "quads,glutes", "machine", "cardio", "Maquina de escadas rotativas. Sobe continuamente."),
    ("Air Bike", "cardio", "fullbody", "machine", "cardio", "Bicicleta com ventoinha. Bracos e pernas simultaneamente."),
    ("Squat Jumps", "cardio", "quads,glutes", "bodyweight", "cardio", "Agacha e salta explosivamente para cima."),
    ("Lunge Jumps", "cardio", "quads,glutes", "bodyweight", "cardio", "Lunge com salto alternando pernas no ar."),
    ("Tuck Jumps", "cardio", "quads,abs", "bodyweight", "cardio", "Salta levando os joelhos ate ao peito."),
    ("Skater Jumps", "cardio", "glutes,quads", "bodyweight", "cardio", "Salta lateralmente de uma perna para a outra."),
    ("Bear Crawl", "cardio", "fullbody", "bodyweight", "cardio", "Em quatro apoios. Move braco e perna opostos simultaneamente."),
    ("Crab Walk", "cardio", "fullbody", "bodyweight", "cardio", "Sentado com costas no chao. Move usando bracos e pernas."),
]

MOBILITY = [
    ("Foam Roller Costas", "mobility", "back", "foam_roller", "mobility", "Deita-te sobre o foam roller. Rola ao longo das costas."),
    ("Foam Roller Pernas", "mobility", "quads,hamstrings", "foam_roller", "mobility", "Deita-te de lado ou de frente. Rola o foam roller ao longo das pernas."),
    ("Foam Roller IT Band", "mobility", "quads", "foam_roller", "mobility", "Deitado de lado. Rola a banda IT na parte externa da coxa."),
    ("Foam Roller Lats", "mobility", "back", "foam_roller", "mobility", "Deitado de lado. Rola os dorsais sobre o foam roller."),
    ("Cat-Cow Stretch", "mobility", "back,abs", "bodyweight", "mobility", "Em quatro apoios. Alterna arquear e curvar as costas."),
    ("Child's Pose", "mobility", "back,shoulders", "bodyweight", "mobility", "De joelhos sentado nos calcanhos. Estende os bracos a frente e baixa o tronco."),
    ("Downward Dog", "mobility", "shoulders,hamstrings", "bodyweight", "mobility", "Maos e pes no chao. Eleva a anca formando um V invertido."),
    ("Hip Flexor Stretch", "mobility", "quads,hips", "bodyweight", "mobility", "Posicao de lunge baixo. Empurra a anca a frente alongando a frente da anca."),
    ("Pigeon Pose", "mobility", "glutes,hip", "bodyweight", "mobility", "Posicao de pomba. Uma perna dobrada a frente, outra esticada atras."),
    ("Hamstring Stretch", "mobility", "hamstrings", "bodyweight", "mobility", "Sentado. Estica uma perna e inclina-te a frente."),
    ("Shoulder Dislocates com Elastico", "mobility", "shoulders", "band", "mobility", "Segura um elastico a frente. Passa-o por cima da cabeca ate atras e volta."),
    ("Thoracic Rotation", "mobility", "back", "bodyweight", "mobility", "Em quatro apoios. Rota o tronco levando um braco para cima."),
    ("World's Greatest Stretch", "mobility", "fullbody", "bodyweight", "mobility", "Lunge baixo. Coloca a mao oposta no chao. Estende o outro braco para cima."),
    ("90/90 Hip Stretch", "mobility", "glutes,hip", "bodyweight", "mobility", "Sentado. Uma perna a 90 graus a frente, outra a 90 graus ao lado."),
    ("Couch Stretch", "mobility", "quads,hip", "bodyweight", "mobility", "Posicao de lunge com a perna de tras encostada na parede."),
    ("Wall Slides", "mobility", "shoulders,back", "bodyweight", "mobility", "Costas na parede. Sobe e desce os bracos mantendo contacto."),
    ("Band Pull-Apart", "mobility", "shoulders,back", "band", "mobility", "Segura um elastico a frente. Abre puxando para os lados."),
    ("Figure 4 Stretch", "mobility", "glutes", "bodyweight", "mobility", "Deitado. Cruza uma perna sobre a outra formando um 4. Puxa."),
    ("Calf Stretch", "mobility", "calves", "bodyweight", "mobility", "Em pe numa borda. Deixa o calcanhar descer."),
    ("Doorway Stretch", "mobility", "chest,shoulders", "bodyweight", "mobility", "Braco na ombreira de uma porta. Rota o corpo para o lado oposto."),
    ("Neck Rolls", "mobility", "traps", "bodyweight", "mobility", "Rota a cabeca lentamente em circulo."),
    ("Seated Spinal Twist", "mobility", "back", "bodyweight", "mobility", "Sentado. Rota o tronco colocando um braco na coxa oposta."),
    ("Standing Quad Stretch", "mobility", "quads", "bodyweight", "mobility", "Em pe. Puxa o pe para o gluteo com a mao."),
    ("Lying Rotation", "mobility", "back,glutes", "bodyweight", "mobility", "Deitado. Deixa os joelhos cairem para um lado mantendo o tronco no chao."),
    ("Half Kneeling Hip Opener", "mobility", "glutes,hip", "bodyweight", "mobility", "Meio ajoelhado. Empurra o joelho para fora com o cotovelo."),
    ("Jefferson Curl", "mobility", "hamstrings,back", "barbell", "mobility", "De pe numa superficie elevada. Segura uma barra leve. Enrola a coluna para baixo."),
]

ALL_EXERCISES = (
    CHEST + BACK + SHOULDERS + BICEPS + TRICEPS +
    LEGS_QUADS + LEGS_HAMS_GLUTES + CALVES + ABS + FOREARMS + CARDIO + MOBILITY
)

# Clean up any malformed tuples
cleaned = []
for ex in ALL_EXERCISES:
    if isinstance(ex, tuple) and len(ex) == 6:
        cleaned.append(ex)
    elif isinstance(ex, str):
        pass  # skip malformed string entries

ALL_EXERCISES = cleaned

print(f"Base exercises: {len(ALL_EXERCISES)}")

# Now generate variations to reach 500+
# We'll create variations with different equipment, grips, and angles

variation_suffixes = [
    ("Unilateral", "unilateral"),
    ("Isometrico", "isometrico"),
    ("Pausa no Ponto de Contracao", "pausa"),
    ("Tempo Controlado (3s descida)", "tempo"),
    ("Eccentrico Acentuado", "eccentrico"),
    (" com 1.5 Reps", "1.5reps"),
]

# Generate variations for compound exercises - limit to reach ~520
compound_exercises = [ex for ex in ALL_EXERCISES if ex[3] in ('barbell', 'dumbbell', 'cable', 'machine') and ex[4] == 'strength']

variations = []
seen_names = set(ex[0] for ex in ALL_EXERCISES)
target_count = 520
for ex in compound_exercises:
    if len(ALL_EXERCISES) + len(variations) >= target_count:
        break
    base_name = ex[0]
    for suffix_name, suffix_key in variation_suffixes:
        var_name = f"{base_name} {suffix_name}"
        if var_name not in seen_names:
            seen_names.add(var_name)
            instructions = ex[5]
            if suffix_key == "unilateral":
                instructions += " Executa uma perna/braco de cada vez."
            elif suffix_key == "isometrico":
                instructions += " Mantem a contracao no ponto mais dificil por 3-5 segundos."
            elif suffix_key == "pausa":
                instructions += " Faz uma pausa de 1-2 segundos no ponto de maxima contracao."
            elif suffix_key == "tempo":
                instructions += " Controla a descida em 3 segundos."
            elif suffix_key == "parcial":
                instructions += " Usa range de movimento parcial para maior tensao."
            elif suffix_key == "bfr":
                instructions += " Usa banda de restricao de fluxo sanguineo com peso moderado."
            elif suffix_key == "deadstop":
                instructions += " Para completamente no ponto mais baixo entre repeticoes."
            elif suffix_key == "eccentrico":
                instructions += " Foca na fase eccentrica (descida) em 4-5 segundos."
            elif suffix_key == "1.5reps":
                instructions += " Faz uma rep completa, depois meia rep, e conta como uma."
            elif suffix_key == "pausa-inferior":
                instructions += " Faz pausa de 2 segundos no ponto mais baixo do movimento."
            elif suffix_key == "banda":
                instructions += " Adiciona banda de resistencia para maior tensao."
            elif suffix_key == "larga":
                instructions += " Usa pegada mais larga que o normal."
            elif suffix_key == "estreita":
                instructions += " Usa pegada mais estreita que o normal."
            elif suffix_key == "neutra":
                instructions += " Usa pegada neutra (palmas frente a frente)."
            elif suffix_key == "inversa":
                instructions += " Usa pegada inversa (palmas para ti)."

            # Map equipment for some variations
            eq = ex[3]
            if suffix_key == "banda":
                eq = "band"
            elif suffix_key == "unilateral" and eq == "barbell":
                eq = "dumbbell"

            variations.append((
                var_name,
                ex[1],  # primary_muscle
                ex[2],  # secondary_muscles
                eq,
                ex[4],  # type
                instructions
            ))

combined = ALL_EXERCISES + variations
# Remove duplicates by name
unique = {}
for ex in combined:
    if ex[0] not in unique:
        unique[ex[0]] = ex

final = list(unique.values())
print(f"Total unique exercises: {len(final)}")

# If still under 500, add more specific variations
if len(final) < 500:
    # Add tempo/pause variations for bodyweight exercises
    bw_exercises = [ex for ex in ALL_EXERCISES if ex[3] == 'bodyweight']
    for ex in bw_exercises:
        for suffix_name, suffix_key in [("Explosivo", "explosivo"), ("Lento e Controlado", "lento"), ("Unilateral", "unilateral")]:
            var_name = f"{ex[0]} {suffix_name}"
            if var_name not in unique:
                instructions = ex[5]
                if suffix_key == "explosivo":
                    instructions += " Executa de forma explosiva."
                elif suffix_key == "lento":
                    instructions += " Controla o movimento em 4 segundos na descida."
                elif suffix_key == "unilateral":
                    instructions += " Executa um lado de cada vez."
                eq = ex[3]
                final.append((var_name, ex[1], ex[2], eq, ex[4], instructions))
                unique[var_name] = True

print(f"Final total: {len(final)}")

# Generate TypeScript file
lines = []
lines.append("export interface SeedExercise {")
lines.append("  name: string;")
lines.append("  primary_muscle: string;")
lines.append("  secondary_muscles: string;")
lines.append("  equipment: string;")
lines.append("  type: string;")
lines.append("  instructions: string;")
lines.append("}")
lines.append("")
lines.append("export const EXERCISE_SEED_DATA: SeedExercise[] = [")

for ex in final:
    name = ex[0].replace("'", "\\'")
    pm = ex[1]
    sm = ex[2]
    eq = ex[3]
    tp = ex[4]
    inst = ex[5].replace("'", "\\'")
    lines.append(f"  {{ name: '{name}', primary_muscle: '{pm}', secondary_muscles: '{sm}', equipment: '{eq}', type: '{tp}', instructions: '{inst}' }},")

lines.append("];")

with open("db/exerciseSeedData.ts", "w") as f:
    f.write("\n".join(lines))

print(f"Generated {len(final)} exercises in db/exerciseSeedData.ts")
