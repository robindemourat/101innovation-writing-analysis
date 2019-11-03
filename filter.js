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
  'Arts et Lettres': 'SHS',
  'Sciences physiques': 'STEM',
  'Droit': 'SHS'
}
const disciplineCategoriesReverse = {
  'SHS': ['Sciences sociales et économie', 'Arts et Lettres', 'Droit'],
  'STEM': ['Sciences de la vie', 'Sciences de la vie', 'Ingénierie & technologie', 'Sciences physiques'],
  'Médecine': ['Médecine'],
  // 'Arts et Lettres': ['Arts et Lettres'],
  // 'Droit': ['Droit']
}

const disciplineCategoriesList = ['SHS', 'STEM', 'Médecine'/*, 'Arts et Lettres', 'Droit'*/];

const psv = dsv.dsvFormat(";");

const toolsByRespondant = [];

const toolsList = {};

const toolsTemp = fs.readFileSync(toolsCategoriesInput, 'utf8');
// array of tools and their categories
const toolsCategoriesCorr = dsv.csvParse(toolsTemp);
// nest by categories
const toolsCategoriesList = collection.nest()
                              .key(d => d.famille)
                              .entries(toolsCategoriesCorr)
                              .filter(d => d.key.length)
                              .map(d => d.key);
// map of tools with their corresponding category
const toolsCategories = toolsCategoriesCorr.reduce((result, item) => {
  result[item.tool] = item.famille.length ? item.famille : 'autre';
  return result;
}, {});
const toolsCategoriesListWithTools = collection.nest()
      .key(d => d.famille)
      .entries(toolsCategoriesCorr)
      .filter(d => d.key.length)
      .map(d => Object.assign({
        category: d.key,
        tools: d.values.map(t => t.tool)
      }))

fs.readFile(input, 'utf8', (err, str) => {
  const inputData = psv.parse(str);
  const respondants = [];
  // weighten tools by number of responses for each participant
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

    // filter out non-respondants
    if (!tools.length) {
      return globalResult;
    }
    // tools = tools.length ? tools : ['inconnu'];

    // ponderation to attribute to respondant when talking about disciplines
    const respondantDisciplineWeight = 1 / disciplines.length;
    const respondantDisciplineCategories = Object.keys(disciplineCategoriesReverse)
      .filter(cat => disciplineCategoriesReverse[cat].find(discipline => disciplines.indexOf(discipline) > -1));

    const respondantDisciplineCategoryWeight = 1 / respondantDisciplineCategories.length;

    respondants.push(Object.assign({}, basis, {
      tools, disciplines, respondantDisciplineWeight, respondantDisciplineCategoryWeight
    }));

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
          {
            weight,
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



  fs.writeFile('outputs/output_by_respondant.csv', dsv.csvFormat(toolsByRespondant), 'utf8', (err) => {
    if (err) {
      console.log(err);
    }
    else console.log('done for raw output');
  });

  fs.writeFile('outputs/tools.txt', Object.keys(toolsList).join('\n'), 'utf8', (err) => {
    if (err) {
      console.log(err);
    } else console.log('done for tools list');
  })
  fs.writeFile('outputs/output_weightened.csv', dsv.csvFormat(toolsWeightened), 'utf8', (err) => {
    if (err) {
      console.log(err);
    }
    else console.log('done for weightened output');
  });

  // respondants by disciplines (some respondants are present in two categories, thus they are weightened)
  const respondantsByDiscipline = Object.keys(disciplineCategories).map(catName => {
      // const catName = Object.keys(disciplineCategories).find(name => {
      //   return disciplineCategories[name] === catId
      // });
      
      const fRespondants = respondants.filter(r => r.disciplines.indexOf(catName) > -1)
      const catId = disciplineCategories[catName]
      return {
        catId,
        catName,
        respondants: fRespondants
      }
  });
  // respondants by disciplines categories
  const respondantsDisciplineCategories = disciplineCategoriesList.map(catId => {
      const fRespondants = respondants
        .filter(r => r.disciplines.find(disc => disciplineCategoriesReverse[catId].indexOf(disc) > -1) !== undefined)

      return {
        catId,
        count: fRespondants.reduce((sum, resp) => sum + resp.respondantDisciplineCategoryWeight, 0)
      }
  });
  const respondantsDisciplineCategoriesSum = respondantsDisciplineCategories.reduce((sum, cat) => sum + cat.count , 0);
  respondantsDisciplineCategories.forEach(cat => {
    cat.fraction = cat.count / respondantsDisciplineCategoriesSum;
    cat.percentage = cat.fraction * 100;
  })
  // respondants by disciplines categories
  const respondantsByDisciplineCategory = disciplineCategoriesList.map(catId => {
      const fRespondants = respondants
        .filter(r => r.disciplines.find(disc => disciplineCategoriesReverse[catId].indexOf(disc) > -1) !== undefined)


      return {
        catId,
        respondants: fRespondants
      }
  });

  // tools popularity (percentage of times each tool was mentionned)
  const toolsPopularity = toolsCategoriesCorr.map(tool => {
    const toolName= tool.tool;
    // how many respondants mentionned this tool ?
    const count = respondants.reduce((sum, resp) => sum + (resp.tools.indexOf(toolName) > -1  ? 1 : 0), 0);
    const fractionOfUse = count / respondants.length;
    return Object.assign({}, tool, {
      count, 
      fractionOfUse,
      percentageOfUse: fractionOfUse * 100
    });
  })
  .sort((a, b) => {
    if (a.count < b.count) {
      return 1;
    }
    return -1;
  });
  let toolsCategoriesPopularitySum = 0;
  let toolsCategoriesPopularity = toolsCategoriesCorr.reduce((total, tool) => {
    const toolName= tool.tool;
    const famille = tool.famille || 'autre';
    // how many respondants mentionned this tool ?
    const count = respondants.reduce((sum, resp) => sum + (resp.tools.indexOf(toolName) > -1  ? 1 : 0), 0);
    // console.log(toolName, total.famille ? total.famille + count : count)
    toolsCategoriesPopularitySum = toolsCategoriesPopularitySum + count
    // const fractionOfUse = count / respondants.length;
    return Object.assign(total, {
      [famille]: (total[famille] || 0) + count
    });
  }, {});
  toolsCategoriesPopularity = Object.keys(toolsCategoriesPopularity).map(famille => {
    return {
      famille: famille,
      count: toolsCategoriesPopularity[famille],
      fraction: toolsCategoriesPopularity[famille] / toolsCategoriesPopularitySum
    }
  })
  .sort((a, b) => {
    if (a.count < b.count) {
      return 1;
    }
    return -1;
  });
  const toolsPopularity20best = toolsPopularity
    .filter(t => t.tool !== 'inconnu')
    .slice(0, 20);

  // tools for each discipline (1 line = 1 tool's intersection with 1 discipline)
  const toolsPopularityByDiscipline = toolsCategoriesCorr.reduce((total, tool) => {
    const toolName= tool.tool;
    return total.concat(
      respondantsByDiscipline.reduce((total2, discipline) => {
        const count = discipline.respondants.reduce((sum, resp) => sum + (resp.tools.indexOf(toolName) > -1  ? resp.respondantDisciplineWeight : 0), 0);
        const fractionOfUse = count / discipline.respondants.map(r => r.respondantDisciplineWeight);
        return total2.concat({
          toolName,
          famille: tool.famille || 'autre',
          discipline: discipline.catName,
          discipline_categorie: disciplineCategories[discipline.catName],
          total_respondants_discipline: discipline.respondants.length,
          count,
          fractionOfUse,
          percentageOfUse: fractionOfUse * 100
        })
      }, [])
    )
  }, []);
  
  // tools categories popularity by discipline category
  const toolsCategoriesPopularityByDisciplineCategory = toolsCategoriesListWithTools.reduce((total, toolCategoryObj) => {
    const toolCategory = toolCategoryObj.category;
    const relatedTools = toolCategoryObj.tools
    return total.concat(
      respondantsByDisciplineCategory.reduce((total2, discipline) => {
        const count = discipline.respondants.reduce((sum, resp) => {
          // does this respondant use at least one of the tools of the category ?
          const hasOne = relatedTools.find(t1 => resp.tools.indexOf(t1) > -1);
          return sum + (hasOne  ? resp.respondantDisciplineCategoryWeight : 0);
        }, 0);
        const fractionOfUse = count / discipline.respondants.length;
        return total2.concat({
          famille: toolCategory,
          discipline_category: discipline.catId,
          count,
          total_respondants_discipline: discipline.respondants.length,
          fractionOfUse,
          percentageOfUse: fractionOfUse * 100
        })
      }, [])
    )
  }, []);
  
  let toolsCategoriesPopularityForSHS = toolsCategoriesCorr
  .map(tool => tool.tool)
  .reduce((total, toolName) => {
    return Object.assign(total, {
      [toolName]: respondantsByDiscipline
      .filter(discipline => 
        discipline.catId === 'SHS'
      )
      .reduce((disciplineCount, discipline) => {
        return discipline.respondants.reduce((sum, resp) => sum + (resp.tools.indexOf(toolName) > -1  ? resp.respondantDisciplineWeight : 0), disciplineCount)
      }, 0)
    })
  }, {})
  let toolsCategoriesPopularityForSHSTotal = Object.keys(toolsCategoriesPopularityForSHS).reduce((sum, key) => sum + toolsCategoriesPopularityForSHS[key], 0);
  toolsCategoriesPopularityForSHS = Object.keys(toolsCategoriesPopularityForSHS)
  .map(toolName => {
    return {
      tool: toolName,
      count: toolsCategoriesPopularityForSHS[toolName],
      fraction: toolsCategoriesPopularityForSHS[toolName] / toolsCategoriesPopularityForSHSTotal
    }
  })

  
  fs.writeFile('outputs/output_respondants_discipline_categories.csv', dsv.csvFormat(respondantsDisciplineCategories), 'utf8', (err) => {
    if (err) {
      console.log(err);
    }
    else console.log('done for output_respondants_discipline_categories');
  });

  fs.writeFile('outputs/output_tools_popularity_all.csv', dsv.csvFormat(toolsPopularity), 'utf8', (err) => {
    if (err) {
      console.log(err);
    }
    else console.log('done for output_tools_popularity_all');
  });
  fs.writeFile('outputs/output_tools_categories_pop.csv', dsv.csvFormat(toolsCategoriesPopularity), 'utf8', (err) => {
    if (err) {
      console.log(err);
    }
    else console.log('done for output_tools_categories_pop');
  });
  fs.writeFile('outputs/output_tools_popularity_20best.csv', dsv.csvFormat(toolsPopularity20best), 'utf8', (err) => {
    if (err) {
      console.log(err);
    }
    else console.log('done for output_tools_popularity_10best');
  });
  fs.writeFile('outputs/output_tools_popularity_by_discipline.csv', dsv.csvFormat(toolsPopularityByDiscipline), 'utf8', (err) => {
    if (err) {
      console.log(err);
    }
    else console.log('done for output_tools_popularity_by_discipline');
  });
  fs.writeFile('outputs/output_tools_categories_popularity_by_discipline_categories.csv', dsv.csvFormat(toolsCategoriesPopularityByDisciplineCategory), 'utf8', (err) => {
    if (err) {
      console.log(err);
    }
    else console.log('done for output_tools_categories_popularity_by_discipline_categories');
  });
  fs.writeFile('outputs/output_selection_shs.csv', dsv.csvFormat(toolsCategoriesPopularityForSHS), 'utf8', (err) => {
    if (err) {
      console.log(err);
    }
    else console.log('done for output_tools_categories_popularity_by_discipline_categories');
  });
  fs.writeFile('outputs/output_tools_categories_popularity_by_discipline.csv', dsv.csvFormat(toolsPopularityByDiscipline), 'utf8', (err) => {
    if (err) {
      console.log(err);
    }
    else console.log('done for output_tools_categories_popularity_by_discipline');
  });


  // tools weightened by participants number of responses
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

  fs.writeFile('outputs/output_weightened_normalized_by_discipline_cat.csv', dsv.csvFormat(toolsWeightenedNormalizedByDisciplineCategory), 'utf8', (err) => {
    if (err) {
      console.log(err);
    }
    else console.log('done for weightened output');
  });


fs.writeFile('outputs/output_weightened_normalized_by_discipline_cat_no_wysiwyg.csv', dsv.csvFormat(
  toolsWeightenedNormalizedByDisciplineCategory
  .filter(t => t.tool_cat !== 'wysiwyg bureautique')
), 'utf8', (err) => {
    if (err) {
      console.log(err);
    }
    else console.log('done for weightened output');
  });

  fs.writeFile('outputs/output_weightened_no_wysiwyg.csv', dsv.csvFormat(
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
  fs.writeFile('outputs/tools_pondered_use.csv', dsv.csvFormat(toolsWeights), 'utf8', (err) => {
    if (err) {
      console.log(err)
    } else console.log('done for tools use')
  })

  Object.keys(disciplineTranslations).forEach(en => {
    const fr = disciplineTranslations[en];
    const filtered = toolsWeightened.filter(t => t.discipline === fr);
    console.log('writing for', fr);
    fs.writeFile(`outputs/output_weightened_${fr}.csv`, dsv.csvFormat(filtered), 'utf8', (err) => {
      if (err) {
        console.log(err);
      }
      else console.log('done for weightened output %s', fr);
    });
  })

})