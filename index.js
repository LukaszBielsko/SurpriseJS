#!/usr/bin/env node

const fs = require('fs');
const inquirer = require('inquirer');
const pluralize = require('pluralize');
const {
  SELECTPROJECT,
  COREQUESTIONS,
  ROUTEQUESTIONS,
  SELECTCRUDROUTE,
  CURR_DIR
} = require('./questions');

inquirer.prompt(SELECTPROJECT).then(answer => {
  const selectedProject = answer['project-choice'];
  const templatePath = `${__dirname}/templates/${selectedProject}`;

  if (
    selectedProject !== 'surprisejs-core' &&
    !fs.existsSync(`${CURR_DIR}/app.js`)
  ) {
    return console.log(
      '⚠️  app.js does not exists, maybe You are in wrong directory?  ⚠️'
    );
  }

  switch (selectedProject) {
    case 'surprisejs-auth':
      authCLI(templatePath);
      break;
    case 'surprisejs-core':
      coreCLI(templatePath);
      break;
    case 'surprisejs-cors':
      corsCLI();
      break;
    case 'surprisejs-crud':
      crudCLI();
      break;
    case 'surprisejs-route':
      routeCLI(templatePath);
      break;
    default:
      console.log('Something went wrong');
  }
});

authCLI = async templatePath => {
  const filesToCreate = fs.readdirSync(templatePath).filter(file => file.includes('.js'));
  let generateFiles = true;
  let generateMiddleware = true;
  if (fs.existsSync(`${CURR_DIR}/routes/login`)) {
    const fileAnswer = await inquirer.prompt({
      name: 'overrideRoute',
      type: 'confirm',
      message: 'Are you sure you want to override actual login route?'
    })
    if (!fileAnswer.overrideRoute) generateFiles = false;
  }

  if (fs.existsSync(`${CURR_DIR}/middlewares/auth.js`)) {
    const middlewareAnswer = await inquirer.prompt({
      name: 'overrideMiddleware',
      type: 'confirm',
      message: 'Are you sure you want to override actual auth middleware?'
    })
    if (!middlewareAnswer.overrideMiddleware) generateMiddleware = false;
  }

  if (!generateFiles && !generateMiddleware) return

  if (generateMiddleware) {
    if (!fs.existsSync(`${CURR_DIR}/middlewares`)) fs.mkdirSync(`${CURR_DIR}/middlewares`)
    const middlewareContent = fs.readFileSync(`${templatePath}/middleware/auth.js`)
    fs.writeFileSync(`${CURR_DIR}/middlewares/auth.js`, middlewareContent)

    const content = fs.readFileSync(`${CURR_DIR}/app.js`, 'utf8');
    if (content.includes(`require('./middlewares/auth'))`)) return

    const prefixAnswer = await inquirer.prompt({
      name: 'prefix',
      type: 'input',
      message: 'Provide Your route prefix where auth should work:'
    })
    let { prefix } = prefixAnswer
    prefix = prefix === '' ? '/' : prefix[0] === '/' ? prefix : `/${prefix}`;
    const contentArray = content.split('\n');
    const lookingPart = contentArray.find(string => string.includes(`app.use('`));
    const lookingPartIndex = contentArray.indexOf(lookingPart);
    const stringToAdd = `app.use('${prefix}', require('./middlewares/auth'));`;
    const concatString = `${stringToAdd}\n${lookingPart}`;
    contentArray[lookingPartIndex] = concatString;
    fs.writeFileSync(`${CURR_DIR}/app.js`, contentArray.join('\n'));
  }

  if (generateFiles) {
    if (!fs.existsSync(`${CURR_DIR}/routes/login`)) fs.mkdirSync(`${CURR_DIR}/routes/login`);
    filesToCreate.forEach(file => {
      const origFilePath = `${templatePath}/${file}`;
      const loginContent = fs.readFileSync(origFilePath, 'utf8');
      const writePath = `${CURR_DIR}/routes/login/${file}`;
      fs.writeFileSync(writePath, loginContent, 'utf8');
    });
    const content = fs.readFileSync(`${CURR_DIR}/app.js`, 'utf8');
    const reversedContentArray = content.split('\n').reverse();
    const contentArray = content.split('\n');
    const lookingPart = reversedContentArray.find(string => string.includes(`app.use('`));
    const lookingPartIndex = contentArray.indexOf(lookingPart);
    const stringToAdd = `app.use('/login', require('./routes/logins/router'));`;
    const concatString = `${lookingPart}\n${stringToAdd}`;
    contentArray[lookingPartIndex] = concatString;
    fs.writeFileSync(`${CURR_DIR}/app.js`, contentArray.join('\n'));
  }
};

coreCLI = templatePath => inquirer.prompt(COREQUESTIONS).then(answers => {
  const projectName = answers['project-name'];
  const databaseName = answers['database-name'];

  fs.mkdirSync(`${CURR_DIR}/${projectName}`);
  createDirectoryContent(templatePath, projectName, databaseName);
});

crudCLI = () => {
  if (SELECTCRUDROUTE(CURR_DIR) === false) {
    console.log('⚠️  Empty routes directory, use surprise-route option ⚠️');
    return;
  }

  inquirer.prompt(SELECTCRUDROUTE(CURR_DIR)).then(answers => {
    const selectedRoutes = answers['route-crud'];
    selectedRoutes.forEach(selectedRoute => {
      addCrudToRouter(selectedRoute);
    });
  });
};

routeCLI = templatePath => inquirer.prompt(ROUTEQUESTIONS).then(answers => {
  const modelName = answers['model-name'];
  const upperFirstModelName = pluralize(upperFirstLetter(modelName), 1);
  const lowerCaseModelName = modelName.toLowerCase();
  const pluralModelName = pluralize(modelName);
  const filesToCreate = fs.readdirSync(templatePath);
  let routeName = answers['route-name'];
  routeName = routeName[0] === '/' ? routeName : `/${routeName}`;

  const response = addRouteToApplication(routeName, pluralModelName);

  if (!response) {
    console.log(
      '⚠️  app.js does not exists, maybe You are in wrong directory?  ⚠️'
    );
    return;
  }

  fs.mkdirSync(`${CURR_DIR}/routes/${pluralModelName}`);
  filesToCreate.forEach(file => {
    const origFilePath = `${templatePath}/${file}`;
    if (file === 'model.js') {
      const writePath = `${CURR_DIR}/models/${upperFirstModelName}.js`;
      const modelContent = fs
        .readFileSync(origFilePath, 'utf8')
        .replace(/Your-model-name/g, upperFirstModelName)
        .replace(/Your-lower-model-name/g, lowerCaseModelName);

      fs.writeFileSync(writePath, modelContent, 'utf8');
    } else {
      const writePath = `${CURR_DIR}/routes/${pluralModelName}/${file}`;
      const content = fs
        .readFileSync(origFilePath, 'utf8')
        .replace(/Your-model-name/g, upperFirstModelName)
        .replace(/Your-lower-model-name/g, lowerCaseModelName);

      fs.writeFileSync(writePath, content, 'utf8');
    }
  });
});

createDirectoryContent = (templatePath, newProjectPath, databaseName = '') => {
  const filesToCreate = fs.readdirSync(templatePath);

  filesToCreate.forEach(file => {
    const origFilePath = `${templatePath}/${file}`;
    const stats = fs.statSync(origFilePath);

    if (stats.isFile()) {
      const writePath = `${CURR_DIR}/${newProjectPath}/${file}`;
      const content = fs
        .readFileSync(origFilePath, 'utf8')
        .replace('Your-database-name', databaseName);

      fs.writeFileSync(writePath, content, 'utf8');
    } else if (stats.isDirectory()) {
      fs.mkdirSync(`${CURR_DIR}/${newProjectPath}/${file}`);
      createDirectoryContent(
        `${templatePath}/${file}`,
        `${newProjectPath}/${file}`
      );
    }
  });
};

corsCLI = () => {
  const content = fs.readFileSync(`${CURR_DIR}/app.js`, 'utf8');
  if (content.includes(`app.use(require('surprise-cors')`)) {
    return console.log('⚠️  This application already has CORS defined  ⚠️');
  }
  const contentArray = content.split('\n');
  const reversedContentArray = content.split('\n').reverse();
  const lookingPart = reversedContentArray.find(string =>
    string.includes(`app.use('`)
  );
  const lookingPartIndex = contentArray.indexOf(lookingPart);
  const stringToAdd = `app.use(require('surprise-cors')('*')) // You can replace '*' to array of hosts like ["http://localhost:4200", "https://www.myapp.com"]; \n`;
  const concatString = `${stringToAdd}\n${lookingPart}`;
  contentArray[lookingPartIndex] = concatString;
  fs.writeFileSync(`${CURR_DIR}/app.js`, contentArray.join('\n'));
  console.log('💙 Default CORS added to app.js successfully 💙');
};

addRouteToApplication = (routeName, pluralModelName) => {
  if (!fs.existsSync(`${CURR_DIR}/app.js`)) {
    return false;
  }

  const content = fs.readFileSync(`${CURR_DIR}/app.js`, 'utf8');
  const contentArray = content.split('\n');
  const reversedContentArray = content.split('\n').reverse();
  const lookingPart = reversedContentArray.find(string =>
    string.includes('app.use(')
  );
  const lookingPartIndex = contentArray.indexOf(lookingPart);
  const stringToAdd = `app.use('${routeName}', require('./routes/${pluralModelName}/router'))`;
  const concatString = `${lookingPart} \n${stringToAdd}`;
  contentArray[lookingPartIndex] = concatString;

  fs.writeFileSync(`${CURR_DIR}/app.js`, contentArray.join('\n'));
  return true;
};

addCrudToRouter = routeName => {
  const nounSelectedRoute = pluralize(routeName, 1);
  const modelName = upperFirstLetter(nounSelectedRoute);
  const content = fs.readFileSync(
    `${CURR_DIR}/routes/${routeName}/router.js`,
    'utf8'
  );
  const contentArray = content.split('\n');
  const reversedContentArray = content.split('\n').reverse();
  const lookingPart = reversedContentArray.find(string =>
    string.includes('const ')
  );
  const lookingPartIndex = contentArray.indexOf(lookingPart);
  const stringToAdd = `const ${modelName} = require('../../models/${modelName}');
  const { crud } = require('surprise-crud');
  
  crud(${modelName}, router, { pathFromCollection: false });`;
  const concatString = `${lookingPart} \n${stringToAdd}`;
  contentArray[lookingPartIndex] = concatString;

  fs.writeFileSync(
    `${CURR_DIR}/routes/${routeName}/router.js`,
    contentArray.join('\n')
  );

  addSurpriseCrudToPackage();
};

addSurpriseCrudToPackage = () => {
  const content = fs.readFileSync(`${CURR_DIR}/package.json`, 'utf8');
  const contentArray = content.split('\n');
  const reversedContentArray = content.split('\n').reverse();
  const lookingPart = reversedContentArray.find(string =>
    string.includes('express')
  );
  const lookingPartIndex = contentArray.indexOf(lookingPart);
  const stringToAdd = '    "surprise-crud": "latest",';
  const concatString = `${lookingPart} \n${stringToAdd}`;
  contentArray[lookingPartIndex] = concatString;
  fs.writeFileSync(`${CURR_DIR}/package.json`, contentArray.join('\n'));
};

// findLastStringOccurence = (location, lookingString) => {
// }

upperFirstLetter = str => str.charAt(0).toUpperCase() + str.slice(1);