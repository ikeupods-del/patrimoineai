/* Patrimoine AI — règles de la vue fiscale annuelle et de l'aide à la déclaration (produit par QuenTools).

   CE FICHIER SE MODIFIE À LA MAIN quand les cases ou les règles changent : il est lu par l'application, rien d'autre à toucher.
   À VÉRIFIER SUR LA NOTICE OFFICIELLE DE L'ANNÉE (impots.gouv.fr : notices 2042, 2042-C et 2074) avant chaque déclaration.

   « certitude » :
   - 'courante'   : case ou règle utilisée de façon habituelle depuis plusieurs années ; à reconfirmer quand même chaque année ;
   - 'a_verifier' : case ou règle dont le numéro, le plafond ou le champ d'application n'est pas certain : l'application l'affiche
                    avec la mention « à vérifier » et ne s'en sert que pour une estimation.
   Les taux d'imposition (PFU, prélèvements sociaux, tranche marginale…) ne sont pas ici : ils se règlent dans l'application
   (Réglages → Fiscalité), car ils changent avec les lois de finances. */
window.FISCAL_CONFIG = {
  version: 1,
  avertissement: 'À vérifier sur la notice officielle de l’année : les cases et les règles peuvent changer. La déclaration préremplie et les imprimés fiscaux uniques (IFU) de vos plateformes font foi.',

  /* Cases de la déclaration de revenus */
  cases: {
    interets: { case: '2TR', libelle: 'Intérêts et autres produits de placement à revenu fixe', certitude: 'courante' },
    interetsPretsParticipatifs: { case: '2TT', libelle: 'Intérêts des prêts participatifs (crowdlending)', certitude: 'a_verifier',
      note: 'Certaines plateformes indiquent 2TR sur leur IFU : reportez la case indiquée par l’IFU.' },
    dividendes: { case: '2DC', libelle: 'Dividendes éligibles à l’abattement de 40 %', certitude: 'courante' },
    acompte: { case: '2CK', libelle: 'Prélèvement forfaitaire non libératoire déjà versé (acompte de 12,8 %)', certitude: 'courante' },
    dejaSoumisPS: { case: '2BH', libelle: 'Revenus déjà soumis aux prélèvements sociaux, avec CSG déductible', certitude: 'courante',
      note: 'Utile surtout si vous optez pour le barème : la part déductible de la CSG est alors prise en compte.' },
    optionBareme: { case: '2OP', libelle: 'Option pour le barème progressif (vaut pour tous les revenus du capital de l’année)', certitude: 'courante' },
    plusValues: { case: '3VG', libelle: 'Plus-values de cession de valeurs mobilières', certitude: 'courante' },
    moinsValues: { case: '3VH', libelle: 'Moins-values de cession de valeurs mobilières', certitude: 'courante' },
    pertesPretsParticipatifs: { case: '2TU', libelle: 'Pertes en capital sur prêts participatifs', certitude: 'a_verifier',
      note: 'Numéro de case et report des pertes des années précédentes à confirmer sur la notice 2042-C.' },
    microFoncier: { case: '4BE', libelle: 'Micro-foncier : loyers bruts d’une location vide', certitude: 'courante' },
    foncierReel: { formulaire: '2044', libelle: 'Revenus fonciers au régime réel', certitude: 'courante' },
    comptesEtranger: { case: '8UU', formulaire: '3916 ou 3916-bis', libelle: 'Comptes détenus à l’étranger, même sans revenu', certitude: 'courante' },
    crypto: { formulaire: '2086', libelle: 'Cessions de cryptoactifs contre des euros', certitude: 'courante' }
  },

  /* Règles utilisées pour les estimations */
  regles: {
    pertesPretsParticipatifs: {
      texte: 'Une perte en capital définitive sur un prêt participatif (ou un minibon) consenti à une entreprise par une plateforme agréée peut s’imputer sur les intérêts de même nature de l’année, puis des 5 années suivantes, dans une limite annuelle.',
      plafondAnnuel: 8000, reportAns: 5, certitude: 'a_verifier', source: 'Article 125-00 A du code général des impôts' },
    pertesObligations: {
      texte: 'Pour une obligation ou un titre de créance (immobilier fractionné, certains projets), la perte d’un projet en défaut ne suit pas la règle des prêts participatifs : elle n’est en général prise en compte qu’à la cession ou à l’annulation des titres, comme une moins-value.',
      certitude: 'a_verifier' },
    perteDefinitive: {
      texte: 'Seule une perte définitive (procédure terminée, créance irrécouvrable attestée par la plateforme) est imputable : un projet en retard ou en défaut ne l’est pas encore.',
      certitude: 'courante' },
    abattementDividendes: { taux: 40, texte: 'Au barème progressif, les dividendes éligibles bénéficient d’un abattement de 40 %.', certitude: 'courante' },
    csgDeductible: { taux: 6.8, texte: 'Au barème, une part de la CSG est déductible du revenu imposable de l’année suivante (6,8 % jusqu’ici ; à confirmer après la hausse des prélèvements sociaux).', certitude: 'a_verifier' },
    dispenseAcompte: {
      texte: 'Dispense possible de l’acompte de 12,8 % sur les intérêts si le revenu fiscal de référence de l’avant-dernière année est inférieur au seuil, sur demande à la banque ou à la plateforme avant le 30 novembre.',
      seuils: { seul: 25000, couple: 50000 }, certitude: 'a_verifier' }
  }
};
