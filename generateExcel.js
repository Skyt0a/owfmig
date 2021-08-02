var fs = require('fs'),
xml2js = require('xml2js');
const xl = require('excel4node');
const pathToRFC = 'C:/Users/damieje/forms/jasspr-forms/shared/CCORS/schemas/rfc/'
const pathToRFS = 'C:/Users/damieje/forms/jasspr-forms/shared/'
const ChangeElementTag = name => name.toLowerCase() === 'element' ? 'Form' : name 

var restrictions = require('./restriction.json')
var formListWithVersion = []
var projectsFormatted = []
var templatesFormatted = []

fs.readdir(pathToRFC, function(err, files) {
    const parser = new xml2js.Parser({tagNameProcessors: [ChangeElementTag]})
    if (err)
        console.log("could find/read the directory")
    else {
        files.forEach(fileName => {

            if (fileName.includes('Element')) {
                var data = fs.readFileSync(pathToRFC+fileName)
                parser.parseString(data, function(err, result){
                   
                    if(result.Form) {
                        formAttribute = result.Form['$']
                        result.Form.Action.forEach(action =>{
                            formRestriction = restrictions.find(
                                restriction => restriction.NAME === formAttribute.name)
                            actionRestriction = restrictions.find(
                                restriction => restriction.NAME === formAttribute.name+'.'+action['$'].name)
                            formListWithVersion.push({
                                formName: formAttribute.name.toLowerCase(),
                                formDescription: formAttribute.desc,
                                version: formAttribute.version ? formAttribute.version : '1.0',
                                'action/operation name': action['$'].name,
                                'action/operation description': action['$'].desc,
                                newFormName: formAttribute.name.toLowerCase(),
                                newActionName: action['$'].name,
                                formState: formRestriction ? formRestriction.STATE : 'Not Found',
                                formLDAP: formRestriction ? formRestriction.LDAP || '' : 'Not Found',
                                // actionState: actionRestriction ? actionRestriction.STATE : 'N',
                                // actionLDAP: actionRestriction ? actionRestriction.LDAP || '' : ''
                            })
                        })

                    }
                })
            }

            if (fileName.includes('Project')){
                var data = fs.readFileSync(pathToRFC+fileName)
                parser.parseString(data, function(err, result){
                    projects = result.Template.Project
                    templatesFormatted.push({
                        templateName: result.Template['$'].name,
                        templateHelp: result.Template['$'].desc,
                        templateDescription:  result.Template['$'].help,
                        fileName: fileName,
                        category: ''
                    })
                    projects.forEach(project => {
                        if( !project.Form) {
                            console.log('Error : project has a wrong format :',fileName)
                        } else {
                            formVersion = formListWithVersion.find(formRegistered => {
                                return formRegistered.formName === project.Form[0]['$'].name.split('.')[0].toLowerCase()
                            })
                            projectRestriction = restrictions.find(
                                restriction => restriction.TYPE === "project" && restriction.NAME === result.Template['$'].name+'.'+project['$'].name)
                            projectsFormatted.push({
                                projectName: project['$'].name,
                                newProjectName: project['$'].name,
                                projectTitle: project['$'].desc ? project['$'].desc : '',
                                projectDescription: project['$'].help ? project['$'].help : '',
                                projectType: project['$'].type,
                                templateName: result.Template['$'].name,
                                templateDescription: result.Template['$'].desc,
                                formType: 'RFC',
                                formName: project.Form[0]['$'].name,
                                formVersion: formVersion ? formVersion.version : "1.0",
                                projectState: projectRestriction ? projectRestriction.STATE ? projectRestriction.STATE : '' : 'Not Found',
                                projectLDAP: projectRestriction ? projectRestriction.LDAP ? projectRestriction.LDAP : '' : 'Not Found',
                            })
                        }            
                    })
                     
                })
            }
        })
       
    }
    const missingRFSForms = []
    const missingRFSProjects = []
    const subfolderRFS = fs.readdirSync(pathToRFS)
    subfolderRFS.forEach(subFolder => {
        if (subFolder !== 'CCOR' && subFolder !== 'OTHERS') {
            try {
                const RFS_Files = fs.readdirSync(pathToRFS+subFolder+'/schemas/rfs')
                RFS_Files && RFS_Files.forEach(fileName => {
                    if (fileName.includes('RFS')) {
                        var data = fs.readFileSync(pathToRFS+subFolder+'/schemas/rfs/'+fileName)
                        parser.parseString(data, function(err, result){
                        result.RFS.Service[0].Operation.forEach(operation => {
                            formRestriction = restrictions.find(restriction => {
                                return restriction.NAME === result.RFS['$'].name.toLowerCase()+'.'+result.RFS.Service[0]['$'].name.toLowerCase()+'.'+operation['$'].name.toLowerCase()
                            })
                            projectsFormatted.push({
                                projectName: '???',
                                newProjectName: '???',
                                projectTitle: operation['$'].desc,
                                projectDescription: '???',
                                projectType: 'operation',
                                templateName: '???',
                                templateDescription: '???',
                                formType: 'RFS',
                                formName: result.RFS['$'].name + '.' + operation['$'].name,
                                formVersion: result.RFS['$'].version,
                                formState: formRestriction ? formRestriction.STATE : 'Not Found',
                                formLDAP: formRestriction ? formRestriction.LDAP || '' : 'Not Found',
                            })

                            formListWithVersion.push({
                                formName: result.RFS['$'].name,
                                version: result.RFS['$'].version,
                                formDescription: result.RFS['$'].desc,
                                'action/operation name': operation['$'].name,
                                'action/operation description': operation['$'].desc,
                                newFormName: result.RFS['$'].name,
                                newActionName: operation['$'].name,
                                formState: formRestriction ? formRestriction.STATE : 'Not Found',
                                formLDAP: formRestriction ? formRestriction.LDAP || '' : 'Not Found',
                            })
                        })
                        result.RFS.Service.shift()
                        result.RFS.Service && result.RFS.Service.forEach(service => {
                            console.log(service)
                            service.Operation.forEach(operation => {
                                formRestriction = restrictions.find(restriction => {
                                    return restriction.NAME === result.RFS['$'].name.toLowerCase()+'.'+result.RFS.Service[0]['$'].name.toLowerCase()+'.'+operation['$'].name.toLowerCase()
                                })
                                missingRFSProjects.push({
                                    projectName: '???',
                                    newProjectName: '???',
                                    projectTitle: operation['$'].desc,
                                    projectDescription: '???',
                                    projectType: 'operation',
                                    templateName: '???',
                                    templateDescription: '???',
                                    formType: 'RFS',
                                    formName: result.RFS['$'].name + '.' + operation['$'].name,
                                    formVersion: result.RFS['$'].version,
                                    formState: formRestriction ? formRestriction.STATE : 'Not found',
                                    formLDAP: formRestriction ? formRestriction.LDAP || '' : 'Not found',
                                })
    
                                missingRFSForms.push({
                                    formName: result.RFS['$'].name,
                                    version: result.RFS['$'].version,
                                    formDescription: result.RFS['$'].desc,
                                    'action/operation name': operation['$'].name,
                                    'action/operation description': operation['$'].desc,
                                    newFormName: result.RFS['$'].name,
                                    newActionName: operation['$'].name,
                                    formState: formRestriction ? formRestriction.STATE : 'Not Found',
                                    formLDAP: formRestriction ? formRestriction.LDAP || '' : 'Not Found',
                                })
                            })
                        })
                    })                    
                    }
                })
            } catch(err) {
                console.log(err)
            }

        }
    })
    // generate_Excel(projectsFormatted, 'projects')
    // generate_Excel(formListWithVersion, 'forms')
    // generate_Excel(templatesFormatted, 'templates')
    generate_Excel(missingRFSForms, 'missingRFSForms')
    generate_Excel(missingRFSProjects, 'missingRFSProjects')


})
function generate_Excel(data, title) {
    const wb = new xl.Workbook();
    const ws = wb.addWorksheet(title);
    let headingColumnIndex = 1;
    Object.keys(data[0]).forEach(heading => {
        ws.cell(1, headingColumnIndex++)
            .string(heading)
    })
    let rowIndex = 2;
        data.forEach( record => {
            let columnIndex = 1;
            Object.keys(record ).forEach(columnName =>{
                ws.cell(rowIndex,columnIndex++)
                    .string(record [columnName])
            });
            rowIndex++;
        })
    wb.write(title + '.xlsx');
}
