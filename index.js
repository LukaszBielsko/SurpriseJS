#!/usr/bin/env node

const fs = require('fs');
const inquirer = require('inquirer');
const pluralize = require('pluralize');
const process = require('process');
const exec = require('child_process').exec;
const {
  SELECTPROJECT,
  COREQUESTIONS,
  ROUTEQUESTIONS,
  SELECTCRUDROUTE
} = require('./questions');

const {
  addCrudToRouter,
  addRouteToApplication,
  createDirectoryContent,
  findAndReplaceFile,
  upperFirstLetter,
  CURR_DIR
} = require('./helpers')

inquirer.prompt(SELECTPROJECT).then(answer => {
  const selectedProject = answer['project-choice'];
  const templatePath = `${__dirname}/templates/${selectedProject}`;

  if (selectedProject !== 'core' && !fs.existsSync(`${CURR_DIR}/app.js`))
    return console.log('⚠️  app.js does not exists, maybe You are not in project root directory, or should use surprisejs-core first?  ⚠️');

  switch (selectedProject) {
    case 'auth':
      auth(templatePath);
      break;
    case 'core':
      core(templatePath);
      break;
    case 'cors':
      cors();
      break;
    case 'crud':
      crud();
      break;
    case 'route':
      route(templatePath);
      break;
    default:
      console.log('Something went wrong');
  }
});

auth = async templatePath => {
  const filesToCreate = fs.readdirSync(templatePath).filter(file => file.includes('.js'));
  let generateFiles = true;
  let generateMiddleware = true;
  let last = true;

  if (fs.existsSync(`${CURR_DIR}/routes/login`)) {
    const fileAnswer = await inquirer.prompt({
      name: 'overrideRoute',
      type: 'confirm',
      message: 'Are you sure you want to override actual login route?'
    })

    if (!fileAnswer.overrideRoute)
      generateFiles = false;
  }

  if (fs.existsSync(`${CURR_DIR}/middlewares/auth.js`)) {
    const middlewareAnswer = await inquirer.prompt({
      name: 'overrideMiddleware',
      type: 'confirm',
      message: 'Are you sure you want to override actual auth middleware?'
    })

    if (!middlewareAnswer.overrideMiddleware)
      generateMiddleware = false;
  }

  if (!generateFiles && !generateMiddleware)
    return

  if (generateMiddleware) {
    if (!fs.existsSync(`${CURR_DIR}/middlewares`))
      fs.mkdirSync(`${CURR_DIR}/middlewares`)

    const middlewareContent = fs.readFileSync(`${templatePath}/middleware/auth.js`)
    fs.writeFileSync(`${CURR_DIR}/middlewares/auth.js`, middlewareContent)

    if (fs.readFileSync(`${CURR_DIR}/app.js`, 'utf8').includes(`require('./middlewares/auth'))`))
      return

    const prefixAnswer = await inquirer.prompt({
      name: 'prefix',
      type: 'input',
      message: 'Provide Your route prefix where auth should work:'
    })
    let { prefix } = prefixAnswer
    prefix = prefix === '' ? '/' : prefix[0] === '/' ? prefix : `/${prefix}`;

    if (fs.readFileSync(`${CURR_DIR}/app.js`, 'utf8').includes(`app.use('`))
      last = false

    const targetFile = `${CURR_DIR}/app.js`;
    const lookingString = last ? `app.use(` : `app.use('`;
    const stringToAdd = `app.use('${prefix}', require('./middlewares/auth'));\n`;

    findAndReplaceFile(targetFile, lookingString, stringToAdd, last)
    console.log('💙  Auth middleware added to application successfully 💙')
  }

  if (generateFiles) {
    if (!fs.existsSync(`${CURR_DIR}/routes/login`))
      fs.mkdirSync(`${CURR_DIR}/routes/login`);

    filesToCreate.forEach(file => {
      const origFilePath = `${templatePath}/${file}`;
      const loginContent = fs.readFileSync(origFilePath, 'utf8');
      const writePath = `${CURR_DIR}/routes/login/${file}`;
      fs.writeFileSync(writePath, loginContent, 'utf8');
    });

    if (fs.readFileSync(`${CURR_DIR}/app.js`, 'utf8').includes(`app.use('`))
      last = false

    const targetFile = `${CURR_DIR}/app.js`;
    const lookingString = last ? `app.use(` : `app.use('`;
    const stringToAdd = `app.use('/login', require('./routes/login/router'));`;

    findAndReplaceFile(targetFile, lookingString, stringToAdd, last)
    console.log('💙  Login route added to application successfully 💙')
  }

  if (!fs.readFileSync(`${CURR_DIR}/package.json`, 'utf8').includes('jsonwebtoken')) {
    console.log('Running npm install...')
    exec(`npm install jsonwebtoken --save`).stdout.pipe(process.stdout)
  }
};

core = templatePath => inquirer.prompt(COREQUESTIONS).then(answers => {
  const projectName = answers['project-name'];
  const databaseName = answers['database-name'];

  fs.mkdirSync(`${CURR_DIR}/${projectName}`);
  createDirectoryContent(templatePath, projectName, databaseName);

  console.log(`💙  After npm install please run cd ${projectName} and run npm start 💙`); // order change
  console.log('Running npm install...')
  exec(`cd ${projectName} && npm install`).stdout.pipe(process.stdout)
});

crud = async () => {
  if (SELECTCRUDROUTE(CURR_DIR) === false)
    return console.log('⚠️   Empty routes directory, use surprise-route option first ⚠️');

  await inquirer.prompt(SELECTCRUDROUTE(CURR_DIR)).then(answers => {
    const selectedRoutes = answers['route-crud'];
    selectedRoutes.forEach(selectedRoute => {
      addCrudToRouter(selectedRoute);
      console.log(`💙  CRUD added to ${selectedRoute} route successfully 💙`)
    });
  });

  if (!fs.readFileSync(`${CURR_DIR}/package.json`, 'utf8').includes('surprise-crud')) {
    console.log('Running npm install...')
    exec(`npm install surprise-crud --save`).stdout.pipe(process.stdout)
  }
};

route = templatePath => inquirer.prompt(ROUTEQUESTIONS).then(answers => {
  const modelName = answers['model-name'];
  const upperFirstModelName = pluralize(upperFirstLetter(modelName), 1);
  const lowerCaseModelName = modelName.toLowerCase();
  const pluralModelName = pluralize(modelName);
  const lowerCasePluralModelName = pluralModelName.toLowerCase();
  const filesToCreate = fs.readdirSync(templatePath);

  let routeName = answers['route-name'];
  routeName = routeName[0] === '/' ? routeName : `/${routeName}`;
  const response = addRouteToApplication(routeName, lowerCasePluralModelName);

  if (!response)
    return console.log('⚠️  app.js does not exists, maybe You are in wrong directory?  ⚠️');

  fs.mkdirSync(`${CURR_DIR}/routes/${lowerCasePluralModelName}`);
  filesToCreate.forEach(file => {
    const origFilePath = `${templatePath}/${file}`;
    if (file === 'model.js') {
      const writePath = `${CURR_DIR}/models/${upperFirstModelName}.js`;
      const modelContent = fs.readFileSync(origFilePath, 'utf8')
        .replace(/Your-model-name/g, upperFirstModelName)
        .replace(/Your-lower-model-name/g, lowerCaseModelName);

      fs.writeFileSync(writePath, modelContent, 'utf8');
    } else {
      const writePath = `${CURR_DIR}/routes/${lowerCasePluralModelName}/${file}`;
      const content = fs.readFileSync(origFilePath, 'utf8')
        .replace(/Your-model-name/g, upperFirstModelName)
        .replace(/Your-lower-model-name/g, lowerCaseModelName);

      fs.writeFileSync(writePath, content, 'utf8');
    }
  });
  console.log(`💙  ${upperFirstModelName} model and route added to application successfully 💙`)
});

cors = async () => {
  if (
    fs.readFileSync(`${CURR_DIR}/app.js`, 'utf8').includes(`app.use(require('surprise-cors')`) ||
    fs.readFileSync(`${CURR_DIR}/app.js`, 'utf8').includes(`require('cors')`) ||
    fs.readFileSync(`${CURR_DIR}/app.js`, 'utf8').includes(`require("cors")`)
  )
    return console.log('⚠️  This application already has CORS defined  ⚠️');

  const { corsType } = await inquirer.prompt({
    name: 'corsType',
    message: 'Select which type of CORS do You need',
    type: 'list',
    choices: [
      {
        name: 'Basic (only origin (URLs) and Headers are customizable)',
        value: 'Basic'
      },
      {
        name: 'Advanced (full CORS configuration)',
        value: 'Advanced'
      }
    ]
  })

  const targetFile = `${CURR_DIR}/app.js`
  const lookingString = `app.use(`;
  if (corsType === 'Advanced') {
    const stringToAdd = 'app.use(cors())'
    findAndReplaceFile(targetFile, lookingString, stringToAdd)
    const lookingImportString = '= require('
    const importStringToAdd = `const cors = require('cors')`
    findAndReplaceFile(targetFile, lookingImportString, importStringToAdd)
    if (!fs.readFileSync(`${CURR_DIR}/package.json`, 'utf8').includes('"cors')) {
      console.log('Running npm install...')
      exec(`npm install cors --save`).stdout.pipe(process.stdout)
    }
  } else {
    const stringToAdd = `app.use(require('surprise-cors')('*')) // You can replace '*' to array of hosts like ["http://localhost:4200", "https://www.myapp.com"]`
    findAndReplaceFile(targetFile, lookingString, stringToAdd)
    if (!fs.readFileSync(`${CURR_DIR}/package.json`, 'utf8').includes('surprise-cors')) {
      console.log('Running npm install...')
      exec(`npm install surprise-cors --save`).stdout.pipe(process.stdout)
    }
  }

  console.log('💙  Default CORS added to app.js successfully 💙');
};