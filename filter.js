const fs = require('fs');
const dsv = require('d3-dsv');
const collection = require('d3-collection');

const input = 'dataset101.csv';
const toolsCategoriesInput = 'tools.csv';

const basicFields = {
  'id': ['ID'],
  'role': ['ROLE'],
  'last affiliation country': ['COUNTRYCL'],
  'first publication year': ['PUBYEAR'],
};

const multipleResponses = {
  'discipline': ['PHYS',
                'ENGTECH',
                'LIFE',
                'MED',
                'SOCEC',
                'LAW',
                'ARTHUM'],
  'writing tool': ['WORD',
                'GTDRIVE',
                'AUTHOREA',
                'LATEX',
                'SCRIVEN',
                'OVERLEAF',
                'SCALAR',
                'WRITEOTHCL']
}

const disciplineTranslations = {
  'Social Sciences & Economics': 'Sciences sociales et économie',
  'Life Sciences': 'Sciences de la vie',
  'Engineering & Technology': 'Ingénierie & technologie',
  'Medicine': 'Médecine',
  'Arts & Humanities': 'Arts et Lettres',
  'Physical Sciences': 'Sciences physiques',
  'Law': 'Droit'
}

const disciplineCategories = {
  'Sciences sociales et économie': 'SHS',
  'Sciences de la vie': 'STEM',
  'Ingénierie & technologie': 'STEM',
  'Médecine': 'Médecine',
  'Arts et Lettres': 'Arts et Lettres',
  'Sciences physiques': 'STEM',
  'Droit': 'Droit'
}

const disciplineCategoriesList = ['SHS', 'STEM', 'Médecine', 'Arts et Lettres', 'Droit'];

const psv = dsv.dsvFormat(";");

const toolsByRespondant = [];

const toolsList = {};

let toolsCategories;
const toolsTemp = fs.readFileSync(toolsCategoriesInput, 'utf8');
const toolsCategoriesCorr = dsv.csvParse(toolsTemp);
const toolsCategoriesList = collection.nest()
                              .key(d => d.famille)
                              .entries(toolsCategoriesCorr)
                              .filter(d => d.key.length)
                              .map(d => d.key);
toolsCategories = toolsCategoriesCorr.reduce((result, item) => {
  result[item.tool] = item.famille.length ? item.famille : 'autre';
  return result;
}, {});

fs.readFile(input, 'utf8', (err, str) => {
  const inputData = psv.parse(str);
  const toolsWeightened = inputData
  .reduce((globalResult, resp) => {
    const basis = Object.keys(basicFields).reduce((result, key) => {
      result[key] = basicFields[key].map(subKey => {
        return resp[subKey]
      }).join('')
      return result;
    }, {});

    globalResult.push(basis);

    const respondantValues = [];

    let disciplines = multipleResponses.discipline.reduce((result, code) => {
      if (resp[code] && resp[code].trim().length) {
        result.push(disciplineTranslations[resp[code]])
      }
      return result;
    }, []);

    disciplines = disciplines.length ? disciplines : ['inconnue'];

    const customTools = (resp['WRITESPECCL'] || '').split(',').filter(s => s && s.trim().length).map(s => s.trim());

    let tools = multipleResponses['writing tool'].reduce((result, code) => {
      if (resp[code] && resp[code].trim().length) {
        result.push(resp[code])
      }
      return result;
    }, customTools).filter(s => s != '(and also) others');

    tools = tools.length ? tools : ['inconnu'];

    toolsByRespondant.push(Object.assign(
      {},
      basis,
      {
        tools: tools.join(' | '),
        disciplines: disciplines.join(' | ')
      }
    ));

    const weight = 1 / (tools.length + disciplines.length);


    tools.forEach(tool => {
      toolsList[tool] = tool;
      disciplines.forEach(discipline => {
        const subset = Object.assign(
          {},
          basis,
          {weight,
          tool,
          'famille d\'outil': toolsCategories[tool],
          discipline,
          discipline_cat: disciplineCategories[discipline]
        }
        );
        globalResult.push(subset)
      })
    })

    return globalResult;
  }, []);

  // console.log(data);

  fs.writeFile('output_by_respondant.csv', dsv.csvFormat(toolsByRespondant), 'utf8', (err) => {
    if (err) {
      console.log(err);
    }
    else console.log('done for raw output');
  });

  fs.writeFile('tools.txt', Object.keys(toolsList).join('\n'), 'utf8', (err) => {
    if (err) {
      console.log(err);
    } else console.log('done for tools list');
  })
  fs.writeFile('output_weightened.csv', dsv.csvFormat(toolsWeightened), 'utf8', (err) => {
    if (err) {
      console.log(err);
    }
    else console.log('done for weightened output');
  });


  const toolsWeightenedNormalizedByDisciplineCategory = disciplineCategoriesList.reduce((data, catId) => {
    const catsMap = {};
    toolsCategoriesList.forEach(toolCat => {
      catsMap[toolCat] = toolsWeightened.filter(t => t.discipline_cat === catId && t['famille d\'outil'] === toolCat).reduce((sum, t) => sum + t.weight, 0);
    });
    const sum = toolsCategoriesList.reduce((total, key) => total + catsMap[key], 0);
    const sumNoWysiwyg = toolsCategoriesList.filter(c => c !== 'wysiwyg bureautique').reduce((total, key) => total + catsMap[key], 0);
    let check = 0;
    toolsCategoriesList
      .forEach(toolCat => {
        check += catsMap[toolCat] / sum;
        data.push({
          'discipline_cat': catId,
          'tool_cat': toolCat,
          weight: catsMap[toolCat] / sum,
          weight_no_wysiwyg: catsMap[toolCat] / sumNoWysiwyg
        })
      });
    console.log(check);
    return data;
  }, []);
  // console.log(toolsWeightenedNormalizedByDisciplineCategory);

  fs.writeFile('output_weightened_normalized_by_discipline_cat.csv', dsv.csvFormat(toolsWeightenedNormalizedByDisciplineCategory), 'utf8', (err) => {
    if (err) {
      console.log(err);
    }
    else console.log('done for weightened output');
  });


fs.writeFile('output_weightened_normalized_by_discipline_cat_no_wysiwyg.csv', dsv.csvFormat(
  toolsWeightenedNormalizedByDisciplineCategory
  .filter(t => t.tool_cat !== 'wysiwyg bureautique')
), 'utf8', (err) => {
    if (err) {
      console.log(err);
    }
    else console.log('done for weightened output');
  });

  fs.writeFile('output_weightened_no_wysiwyg.csv', dsv.csvFormat(
    toolsWeightened
    .filter(t => t['famille d\'outil'] !== 'wysiwyg bureautique')
    .filter(t => t['famille d\'outil'] !== 'autre')
    .filter(t => t['famille d\'outil'] && t['famille d\'outil'].trim().length)
    .filter(t => t['discipline_cat'].trim() !== '')
  ), 'utf8', (err) => {
    if (err) {
      console.log(err);
    }
    else console.log('done for weightened output');
  });

  const toolsWeights = collection.nest()
    .key(d => d.tool)
    .entries(toolsWeightened)
    .map(tool => {
      return {
        tool: tool.key,
        cat: tool.values[0]['famille d\'outil'],
        compte: tool.values.reduce((sum, resp) => sum + resp.weight, 0)
      }
    })
    .sort((a, b) => {
      if (a.compte > b.compte) {
        return -1
      } else return 1;
    })
  fs.writeFile('tools_use.csv', dsv.csvFormat(toolsWeights), 'utf8', (err) => {
    if (err) {
      console.log(err)
    } else console.log('done for tools use')
  })
  fs.writeFile('tools_use_10.csv', dsv.csvFormat(toolsWeights.slice(0, 11)), 'utf8', (err) => {
    if (err) {
      console.log(err)
    } else console.log('done for tools use')
  })

  Object.keys(disciplineTranslations).forEach(en => {
    const fr = disciplineTranslations[en];
    const filtered = toolsWeightened.filter(t => t.discipline === fr);
    console.log('writing for', fr);
    fs.writeFile(`output_weightened_${fr}.csv`, dsv.csvFormat(filtered), 'utf8', (err) => {
      if (err) {
        console.log(err);
      }
      else console.log('done for weightened output %s', fr);
    });
  })

})