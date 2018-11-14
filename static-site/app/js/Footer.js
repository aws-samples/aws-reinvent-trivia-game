import React from 'react';

class Footer extends React.Component {

    render() {

        let style = {
            width: this.props.width,
            height: this.props.height,
            transform: 'translate3d(0px,' + this.props.top + 'px,0)',
            WebkitTransform: 'translate3d(0px,' + this.props.top + 'px,0)'
        };

        return (
            <div className='footer'>
                <span className='footer' style={style}>
                    © 2018, Amazon Web Services, Inc. or its affiliates. See the source code for this site on <a href="https://github.com/aws-samples/aws-reinvent-2018-trivia-game/">GitHub</a>.
                </span>
            </div>
        );
    }

};

export default Footer;
