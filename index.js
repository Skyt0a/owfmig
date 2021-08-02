var fs = require('fs')
xml2js = require('xml2js')
const excelToJson = require('convert-excel-to-json')
var restrictions = require('./restriction.json')
const { exit } = require('process')


const pathToRFCForms = 'C:/Users/BAZINJE/jasspr/jasspr-forms/shared/CCORS/schemas/rfc/'
const pathToRFS = 'C:/Users/BAZINJE/jasspr/jasspr-forms/shared/'


var ChangeAttributeName = name => name.toLocaleLowerCase() === 'desc' ? 'title' : name.toLocaleLowerCase() === 'help' ? 'description' : name
// The root tag should be RFC but will be changed later on
var ChangeElementTag = name => name.toLowerCase() === 'element' ? 'Form' : name
var RemoveEncodingCharacter = (value, name) => value.replace(/\t/g, '').replace(/\r\n/g, ' ')

var formListWithVersion = []

var RFC = fs.readdirSync(pathToRFCForms)
var projects_XML = RFC.filter(file => file.includes('Project'))
var elements_XML = RFC.filter(file => file.includes('Element'))
let formsExcel = excelToJson({ sourceFile: 'forms.xlsx', columnToKey: { '*': '{{columnHeader}}' } }).forms
let projectsExcel = excelToJson({ sourceFile: 'projects.xlsx', columnToKey: { '*': '{{columnHeader}}' } }).projects
let templatesExcel = excelToJson({ sourceFile: 'templates.xlsx', columnToKey: { '*': '{{columnHeader}}' } }).templates
const formsConsummedByTechnologies = []
const formsConsummedByActions = []
const owfRestrictions = []
const owfMapping = {}


formsExcel = formsExcel.map(form => {
    const newFormNameLowerCase = form.newFormName ? form.newFormName.toLowerCase() : form.newFormName
    const newActionNameLowerCase = form.newActionName ? form.newActionName.toLowerCase() : form.newActionName
    return { ...form, newFormName: newFormNameLowerCase, newActionName: newActionNameLowerCase }
})
projectsExcel = projectsExcel.map(project => {
    const newProjectNameLowerCase = project.newProjectName ? project.newProjectName.toLowerCase() : project.newProjectName
    return { ...project, newProjectName: newProjectNameLowerCase }
})

templatesExcel = templatesExcel.map(template => {
    const newTemplateNameLowerCase = template.newTemplateName ? template.newTemplateName.toLowerCase() : template.newTemplateName
    return { ...template, newTemplateName: newTemplateNameLowerCase }
})


/* ------------------------------ REGISTER FORM VERSION && SUBFORM ------------------------------------------*/

/* 
1/ Register all the elements version, required to build the new template
<Template ...>
  <Project ...>
    <Form name="..." min="1" max="1" version="..."/> <= need to find the version
  </Project>
</Template>

2/ Register all the elements consummed by actions, this will be used to know if an Element is used

*/
var registerParser = new xml2js.Parser({ tagNameProcessors: [ChangeElementTag] })
elements_XML.forEach(fileName => {
    registerParser.parseString(fs.readFileSync(pathToRFCForms + fileName), function(err, result) {
        if (!result) {
            console.error('Error : XML Element is empty', fileName)
            process.exit(1)
        }
        formListWithVersion.push({
            name: result.Form['$'].name.toLowerCase(),
            version: result.Form['$'].version ? result.Form['$'].version : '1.0'
        })
        result.Form.Action.forEach(action => {
            if (action.Form) {
                action.Form.forEach(subForm => {
                    formsConsummedByActions.push({
                        formName: subForm['$'].name.toLowerCase(),
                        parentFormName: result.Form['$'].name.toLowerCase() + '.' + action['$'].name.toLowerCase()
                    })
                })
            }
        })
    })
})
/* ----------------------------------------------------------------------------------------------- */



/*----------------------------------------- GENERATE TECHNOLOGY --------------------------------------------------*/

const mergedTemplates = GenerateTechnologies(projects_XML, true) // Generate all Technologies

function GenerateTechnologies(projects_XML, generateRFSTemplate) {
    var projectParser = new xml2js.Parser({ attrNameProcessors: [ChangeAttributeName], tagNameProcessors: [ChangeElementTag] })

    var templates = []
    var mergedTemplates = []
    projects_XML.forEach(file => templates.push(Generate_Template(file, pathToRFCForms, projectParser)))

    // Create Template / Project for RFS
    if (generateRFSTemplate) {
        RFS_Project = projectsExcel.filter(project => project.formType === 'RFS' && project.projectState !== 'N')
        RFS_Project.forEach(project => {
            var template = templates.find(t => t.Template['$'].name === project.newTemplate)
            var RFSProjectFormatted = {
                '$': {
                    name: project.newProjectName,
                    title: project.projectTitle,
                    type: 'mod',
                    description: project.projectDescription,
                },
                Form: [{ '$': { name: project.formName, min: '1', max: '1', version: project.formVersion } }]
            }
            if (!template) {

                templateExcel = templatesExcel.find(t => t.templateName.toLowerCase() === project.newTemplate.toLowerCase())
                templates.push({
                    Template: {
                        '$': {
                            name: templateExcel.templateName,
                            title: templateExcel.newTemplateTitle,
                            description: templateExcel.newTemplateDescription,
                        },
                        Project: [RFSProjectFormatted]
                    }
                })
            } else {

                template.Template.Project = [...template.Template.Project, RFSProjectFormatted]
            }
        })
    }

    let templateNameMapping = {}

    // Rename & Merge Template & Add Category
    templates.forEach(template => {

        // rename template
        templateExcel = templatesExcel.find(t => t.templateName.toLowerCase() === template.Template['$'].name.toLowerCase())
        if (!templateExcel) {
            console.error('Error : template not found into the Excel ; template name : ', template.Template['$'].name)
            process.exit(1)
        }

        //Template name mapping
        templateNameMapping[templateExcel.newTemplateName ? templateExcel.newTemplateName : template.Template['$'].name] = template.Template['$'].name

        template.Template['$'].category = templateExcel.category.toLowerCase()
        template.Template['$'].title = templateExcel.newTemplateTitle
        template.Template['$'].description = templateExcel.newTemplateDescription
        template.Template['$'].name = templateExcel.newTemplateName ? templateExcel.newTemplateName : template.Template['$'].name
        sameTemplate = mergedTemplates.find(te => template.Template['$'].name === te.Template['$'].name)
        if (!!sameTemplate) {
            sameTemplate.Template.Project = [...sameTemplate.Template.Project, ...template.Template.Project]
        } else {
            mergedTemplates.push(template)
        }

    })

    // move project
    mergedTemplates.forEach(template => {

        // Permission comming from RFC project
        template.Template.Project.forEach(project => {
            let restrictedDG = ''
            let restrictedIS = []
            let restrictedEnv = []

            if (project.$.allow)
                restrictedDG = project.$.allow

            if (project.$.is_allowed)
                restrictedIS = project.$.is_allowed.split(',')

            if (template.Template.$.business_rules)
                restrictedEnv = template.Template.$.business_rules.split(',').map(env => env.split('::')[0])

            let newProjectName = template.Template.$.name + '.' + (projectsExcel.find(pt => pt.projectName === project['$'].name) ? projectsExcel.find(pt => pt.projectName === project['$'].name).newProjectName : project['$'].name)

            if (project.Form.length > 1)
                throw 'Old project having multiple form STRANGE'

            let form = project.Form[0]
            let formExcel = formsExcel.find(f => (f.formName + '.' + f['action/operation name']).toLowerCase() === form['$'].name.toLowerCase())
            let newFormName = formExcel !== undefined ? formExcel.newFormName + '.' + formExcel.newActionName : form.$.name.toLowerCase()

            let newVersion = (formListWithVersion.find(formRegistered => formRegistered.name === newFormName) && formListWithVersion.find(formRegistered => formRegistered.name === newFormName).version)
                || form.$.version
                || '1.0'


            if ((restrictedDG !== '' || restrictedEnv.length !== 0) && restrictedIS.length === 0)
                restrictedIS.push('')

            if (restrictedIS.length !== 0 && restrictedEnv.length === 0)
                restrictedEnv.push('')

            // CMDB
            restrictedIS.forEach(IS => {
                restrictedEnv.forEach(ENV => {
                    addRestrictionToProject(newProjectName, newFormName, newVersion, {
                        method: 'allow',
                        dg: restrictedDG,
                        is: IS,
                        env: ENV
                    })
                })
            })


            // LDAP - Project
            let completeProjectName = templateNameMapping[template.Template.$.name] + '.' + project.$.name
            let ldaps = restrictions.filter(r => (r.STATE === 'Y' && r.LDAP !== '')
                && (
                    (r.TYPE === 'project' && r.NAME.toLowerCase() === completeProjectName.toLowerCase())
                    || (r.TYPE === 'element' && project.Form.find(f => f.$.name.toLowerCase().includes(r.NAME.toLowerCase())) !== undefined)
                    || (r.TYPE === 'action' && project.Form.find(f => f.$.name.toLowerCase() === r.NAME.toLowerCase()) !== undefined)
                )
            ).flatMap(r => r.LDAP.split(','))

            ldaps = [... new Set(ldaps)]

            ldaps.forEach(ldap => {
                addRestrictionToProject(newProjectName, newFormName, newVersion, {
                    method: 'allow',
                    ldap: ldap
                })
            })

            // Mapping template project
            oldProject = template.Template.$.name.toLowerCase() + '.' + project.$.name.toLowerCase()
            owfMapping[oldProject] = {
                form: newFormName,
                version: newVersion
            }

            // Mapping element action
            let oldElement = form.$.name.toLowerCase()
            owfMapping[oldElement] = {
                form: newFormName,
                version: newVersion
            }
        })

        // find project which are not into the right template
        template.Template.Project.forEach(project => {
            newProject = projectsExcel.find(pt => pt.projectName && pt.projectName.toLowerCase() === project['$'].name.toLowerCase())

            // only RFC has a "newProject"
            if (newProject) {
                if (newProject.templateName !== newProject.newTemplate) {

                    renameTemplateName = templatesExcel.find(t => t.templateName === newProject.newTemplate).newTemplateName

                    // add the project to the right template 
                    templateWhereToAddTheProject = mergedTemplates.find(t => t.Template['$'].name === renameTemplateName)
                    templateWhereToAddTheProject.Template.Project = [...templateWhereToAddTheProject.Template.Project, JSON.parse(JSON.stringify(project))]

                    // remove the project from the current template
                    template.Template.Project = template.Template.Project.filter(p => p !== project)
                }
            }
        })
    })


    mergedTemplates.forEach(template => {

        // rename & merge Project
        renameMergedProjects = []

        template.Template.Project.forEach(project => {
            project['$'].name = projectsExcel.find(pt => pt.projectName === project['$'].name) ?
                projectsExcel.find(pt => pt.projectName === project['$'].name).newProjectName : project['$'].name
            similarProject = renameMergedProjects.find(pt => pt['$'].name === project['$'].name)

            formExcel = formsExcel.find(f => (f.formName + '.' + f['action/operation name']).toLowerCase() === project.Form[0]['$'].name.toLowerCase())
            if (!formExcel) {
                console.error('Error : Form Not Found into the Excel ; Project name', project.Form[0]['$'].name.toLowerCase())
                process.exit(1);
            }
            if (formExcel.formState !== 'N') {
                if (similarProject) {
                    if (!similarProject.Form.find(f => f['$'].version === project.Form[0]['$'].version)) {
                        similarProject.Form.push(project.Form[0])
                    }
                } else {
                    renameMergedProjects.push(project)
                }
            }

        })


        // register and rename Form
        renameMergedProjects.forEach(project => {
            project.Form.forEach(form => {

                if (!formsConsummedByTechnologies.includes(form['$'].name.toLowerCase())) {
                    formsConsummedByTechnologies.push(form['$'].name.toLowerCase())
                }
                formExcel = formsExcel.find(f => (f.formName + '.' + f['action/operation name']).toLowerCase() === form['$'].name.toLowerCase())
                form['$'].name = formExcel.newFormName + '.' + formExcel.newActionName
            })
        })
        template.Template.Project = renameMergedProjects


        // Create new attributes for display purpose
        template.Template.Project.forEach(project => {
            projectExcel = projectsExcel.find(pt => pt.newProjectName && pt.newProjectName.toLowerCase() === project['$'].name.toLowerCase())
            if (!projectExcel) {
                console.error('Error : Project Missing into the Excel ; Project name :', project['$'].name)
                process.exit(1)
            }
            project['$'].section_name = projectExcel.section_name
            project['$'].section_sequence = projectExcel.section_sequence
            project['$'].project_sequence = projectExcel.project_sequence
            delete project['$'].governance
            delete project['$'].show_governance
        })

        if (template.Template.Project[0]) {
            createFile('Technology_' + template.Template['$'].name + '.xml', template)
        }
    })
    return mergedTemplates

}

function Generate_Template(fileName, path, parser) {
    var template
    var data = fs.readFileSync(path + fileName)
    parser.parseString(data,
        function(err, result) {
            try {
                if (!result) {
                    console.error('Error : Template No found', fileName)
                    process.exit(1)
                }
                result.Template.Project.forEach(
                    project => {
                        if (project.Form) {
                            formName = project.Form[0]['$'].name.split('.')[0].toLowerCase()
                            if (!formListWithVersion.find(formRegistered => formRegistered.name === formName)) {
                                console.error('Error : cannot find the Element/Form version ; formName :', formName, ';')
                                process.exit(1)
                            }
                            project.Form[0]['$'].version = formListWithVersion.find(formRegistered =>
                                formRegistered.name === formName).version


                        } else {
                            console.error('Error : the project doesn t have an Element ; File name : ', fileName)
                            process.exit(1)
                        }
                    }
                )
                result.Template.Project = result.Template.Project.filter(project => {
                    projectRestriction = restrictions.find(
                        restriction => restriction.TYPE === 'project' && restriction.NAME === result.Template['$'].name + '.' + project['$'].name)

                    return project['$'].type !== 'add' && (projectRestriction && projectRestriction.STATE) !== 'N'
                })
                template = result
            } catch (err) {
                console.error(fileName, err)
                process.exit(1);
            }
        })
    return template
}
/*----------------------------------------- END GENERATE TECHNOLOGY --------------------------------------------------*/





/*----------------------------------------------- GENERATE FORMS ---------------------------------------------------*/

const RFS_FOLDER = fs.readdirSync(pathToRFS)
const RFS_Parser = new xml2js.Parser({ attrNameProcessors: [ChangeAttributeName], attrValueProcessors: [RemoveEncodingCharacter], valueProcessors: [RemoveEncodingCharacter] })
const ELEMENT_PARSER = new xml2js.Parser({ attrNameProcessors: [ChangeAttributeName], attrValueProcessors: [RemoveEncodingCharacter], tagNameProcessors: [ChangeElementTag], valueProcessors: [RemoveEncodingCharacter] })


// List Form Accessible : Form can be accessible via an Action or a Technology
formsConsummed = formsConsummedByTechnologies
formsConsummedByActions.forEach(form => {
    if (formsConsummedByTechnologies.includes(form.parentFormName)) {
        formsConsummed.push(form.formName.toLocaleLowerCase())
    }
})

// Generate RFS Form
RFS_FOLDER.forEach(folder => {
    if (folder !== 'CCOR' && folder !== 'OTHERS' && folder !== 'OWF_GEN') {
        fs.readdir(pathToRFS + folder + '/schemas/rfs', function(err, files) {
            files && files.forEach(fileName => {
                if (fileName.includes('RFS')) {
                    generate_RFS(fileName, pathToRFS + folder + '/schemas/rfs/', RFS_Parser)
                }
            })
        })
    }
})

// Generate RFC
elements_XML.forEach(file => generate_RFC_Element(file, pathToRFCForms, ELEMENT_PARSER))

//COPY other already ok for OWF
// RFS_FOLDER.forEach(folder => {
//     if (folder === 'OTHERS') {
//         fs.readdir(pathToRFS + folder, function(err, files) {
//             files && files.forEach(fileName => {
//                 fs.copyFileSync(pathToRFS + folder + '/' + fileName, 'XML/' + fileName)
//             })
//         })
//     }
// })


function generate_RFS(fileName, path, parser) {
    fs.readFile(path + fileName, function(err, data) {
        parser.parseString(data,
            function(err, result) {
                try {
                    result.RFS.Service.forEach(service => {
                        service.Operation.forEach(operation => {

                            // Set ORCH_PROCEDURE
                            if (operation['$'].automated && operation['$'].automated.toLowerCase() === 'yes') {
                                operation['$'].orch_procedure = operation['$'].name
                            }

                            // RFS CMDB PERMISSION
                            let formExcel = formsExcel.find(f => f['action/operation name'].toLowerCase() === operation['$'].name.toLowerCase() && f.formName.toLowerCase() === result.RFS['$'].name.toLowerCase())
                            let newFormName = ((formExcel && formExcel.newFormName) ? formExcel.newFormName : result.RFS['$'].name) + '.' + ((formExcel && formExcel.newActionName) ? formExcel.newActionName : operation['$'].name)
                            let newVersion = result.RFS['$'].version ? result.RFS['$'].version : '1.0'

                            // Mapping element action
                            let oldElement = `${result.RFS['$'].name.toLowerCase()}.${service['$'].name.toLowerCase()}.${operation['$'].name.toLowerCase()}`
                            owfMapping[oldElement] = {
                                form: newFormName,
                                version: newVersion
                            }

                            let projectsName = mergedTemplates.flatMap(t => t.Template.Project).filter(p => p.Form.find(f => f.$.name === newFormName && f.$.version === newVersion)).map(p => p.$.name)
                            if (projectsName.length === 0) {
                                console.error(`Could not found projects for ${oldElement} v${newVersion}`)
                            }

                            if (service.$.is_allowed || operation.$.is_allowed) {
                                let restrictedDG = ''
                                let restrictedIS = []

                                if (operation.$.is_allowed)
                                    restrictedIS = operation.$.is_allowed.split(',')

                                if (service.$.is_allowed)
                                    restrictedIS = [...restrictedIS, ...service.$.is_allowed.split(',')]



                                projectsName.forEach(projectName => {
                                    let templateName = mergedTemplates.find(t => t.Template.Project.find(p => p.$.name === projectName)).Template.$.name
                                    restrictedIS.forEach(IS => {
                                        addRestrictionToProject(templateName + '.' + projectName, newFormName, newVersion, {
                                            method: 'allow',
                                            dg: restrictedDG,
                                            is: IS,
                                            env: ''
                                        })
                                    })
                                })
                            }

                            // RFS OPERATION SERVICE LDAP PERMISSION
                            let restrictedLDAP = []
                            if (restrictions.filter(r => r.TYPE === 'rfs' && r.NAME.toLowerCase() === result.RFS.$.name.toLowerCase() && r.STATE === 'Y' && r.LDAP !== ''))
                                restrictedLDAP = [...restrictedLDAP, ...restrictions.filter(r => r.TYPE === 'rfs' && r.NAME.toLowerCase() === result.RFS.$.name.toLowerCase() && r.STATE === 'Y' && r.LDAP !== '').flatMap(r => r.LDAP.split(','))]
                            if (restrictions.filter(r => r.TYPE === 'service' && r.NAME.toLowerCase().includes(service.$.name.toLowerCase()) && r.STATE === 'Y' && r.LDAP !== ''))
                                restrictedLDAP = [...restrictedLDAP, ...restrictions.filter(r => r.TYPE === 'rfs' && r.NAME.toLowerCase() === result.RFS.$.name.toLowerCase() && r.STATE === 'Y' && r.LDAP !== '').flatMap(r => r.LDAP.split(','))]
                            if (restrictions.filter(r => r.TYPE === 'operation' && r.NAME.toLowerCase().includes(operation.$.name.toLowerCase()) && r.STATE === 'Y' && r.LDAP !== ''))
                                restrictedLDAP = [...restrictedLDAP, ...restrictions.filter(r => r.TYPE === 'rfs' && r.NAME.toLowerCase() === result.RFS.$.name.toLowerCase() && r.STATE === 'Y' && r.LDAP !== '').flatMap(r => r.LDAP.split(','))]

                            restrictedLDAP = [... new Set(restrictedLDAP)]
                            projectsName.forEach(projectName => {
                                let templateName = mergedTemplates.find(t => t.Template.Project.find(p => p.$.name === projectName)).Template.$.name
                                restrictedLDAP.forEach(LDAP => {
                                    addRestrictionToProject(templateName + '.' + projectName, newFormName, newVersion, {
                                        method: 'allow',
                                        ldap: LDAP
                                    })
                                })
                            })


                            operation['$'].item = service['$'].item
                            operation['$'].version = result.RFS['$'].version ? result.RFS['$'].version : '1.0'
                            RFS_Attributes = { ...result.RFS['$'] }
                            delete RFS_Attributes.version

                            // Renaming
                            formExcel = formsExcel.find(f =>
                                f['action/operation name'].toLowerCase() === operation['$'].name.toLowerCase()
                                && f.formName.toLowerCase() === result.RFS['$'].name.toLowerCase()
                            )
                            if (formExcel) {
                                RFS_Attributes.name = formExcel.newFormName ? formExcel.newFormName : result.RFS['$'].name
                                operation['$'].name = formExcel.newActionName ? formExcel.newActionName : operation['$'].name

                                // Add cloud params
                                if (formExcel.Cloud && formExcel.Cloud.toLowerCase() === 'yes') {
                                    operation['$'].cloud = 'yes'
                                }
                            }
                            form = {
                                RFS: {
                                    '$': { ...RFS_Attributes },
                                    Operation: [operation]
                                }
                            }
                            if (formExcel && formExcel.formState !== 'N') {
                                createFile('Form_' + operation['$'].name + '_v' + operation['$'].version + '.xml', form)
                            }

                        })
                    })


                } catch (err) {
                    console.error(fileName, err)
                    process.exit(1);
                }
            });
    });
}

function generate_RFC_Element(fileName, path, parser) {
    var data = fs.readFileSync(path + fileName)
    parser.parseString(data,
        function(err, result) {
            try {
                var forms = []
                // Change Form to RFC for the root tag
                delete Object.assign(result, { RFC: result.Form })['Form']

                var form = result.RFC

                // Moved the version from Element/RFC to the Action tag level + Add the version into the Form tag
                RFC_Version = form['$'].version
                delete form['$'].version
                form.Action.forEach(action => {
                    action['$'].version = RFC_Version ? RFC_Version : '1.0'
                    if (action.Form) {
                        action.Form.forEach(subForm => {
                            formRegister = formListWithVersion.find(formRegistered =>
                                formRegistered.name === subForm['$'].name.split('.')[0].toLowerCase())
                            subForm['$'].version = formRegister && formRegister.version
                            if (!formRegister) {
                                console.error('this form has no Element/RFC tag', subForm['$'].name.split('.')[0])
                            }
                        })
                    }
                })

                // Split Form by Action
                if (form.Action.length > 1) {
                    form.Action.forEach(action => {
                        forms.push({
                            RFC: { '$': { ...form['$'] }, Action: [action] }
                        })
                    })
                } else {
                    forms.push(result)
                }

                // Filter form not used
                forms = forms.filter(f => {
                    return true
                    fName = f.RFC['$'].name.toLowerCase() + '.' + f.RFC.Action[0]['$'].name.toLowerCase()
                    return formsConsummed.includes(fName)
                })

                // Rename Form, Action, SubForm
                forms.forEach(f => {

                    action = f.RFC.Action[0]

                    var formExcel = formsExcel.find(newF =>
                        newF.formName.toLowerCase() === f.RFC['$'].name.toLowerCase()
                        && newF['action/operation name'].toLowerCase() === action['$'].name.toLowerCase())

                    if (formExcel && formExcel.newActionName !== '#n/a') {
                        action['$'].name = formExcel.newActionName ? formExcel.newActionName : action['$'].name
                        f.RFC['$'].name = formExcel.newFormName ? formExcel.newFormName : f.RFC['$'].name
                    } else {
                        action['$'].name = action['$'].name.toLowerCase()
                    }

                    // Add cloud params
                    if (formExcel && formExcel.Cloud && formExcel.Cloud.toLowerCase() === 'yes') {
                        action['$'].cloud = 'yes'
                    }

                    action.Form && action.Form.forEach(subForm => {
                        subFormExcel = formsExcel.find(f =>
                            f.formName.toLowerCase() + '.' + f['action/operation name'].toLowerCase() === subForm['$'].name.toLowerCase())
                        if (subFormExcel && subFormExcel.newActionName !== '#n/a') {
                            subForm['$'].name = subFormExcel.newFormName + '.' + subFormExcel.newActionName
                        } else {
                            subForm['$'].name = subForm['$'].name.toLowerCase()
                        }
                    })

                    delete f.RFC['$'].description
                    delete f.RFC['$'].title
                    delete f.RFC['$'].icon
                    f.RFC['$'].name = f.RFC['$'].name.toLowerCase()


                    // Generate File
                    if (formExcel && formExcel.formState !== 'N') {
                        createFile('Form_' + action['$'].name + '_v' + action['$'].version + '.xml', f)
                    }
                })


            } catch (err) {
                console.error(fileName, err)
                process.exit(1);
            }
        });

}


function createFile(fileName, jsObject) {
    var builder = new xml2js.Builder();
    var xml = builder.buildObject(jsObject);
    fs.writeFile('XML/' + fileName, xml, function(err, data) {
        if (err) { console.error('WRITE FILE :', err); }
    })
}


function addRestrictionToProject(projectName, formName, version, newRestriction) {
    let currentRestriction = owfRestrictions.find(r => r.projectName === projectName && r.formName === formName && r.version === version)
    if (currentRestriction === undefined) {
        currentRestriction = {
            projectName: projectName,
            formName: formName,
            version: version,
            roleName: projectName + '_v' + version,
            restrictions: []
        }
        owfRestrictions.push(currentRestriction)
    }

    currentRestriction.restrictions.push(newRestriction)
}

setTimeout(() => {
    fs.writeFileSync('owf-restrictions.json', JSON.stringify(owfRestrictions))
    fs.writeFileSync('owf-mapping.json', JSON.stringify(owfMapping))
}, 10_000);